package jp.marinski.familytodo

import android.app.AlertDialog
import android.content.Context
import android.widget.TextView
import androidx.activity.ComponentActivity
import com.google.home.*
import com.google.home.annotation.HomeExperimentalApi
import com.google.home.annotation.HomeExperimentalGenericApi
import com.google.home.automation.*
import com.google.home.google.AssistantBroadcast
import com.google.home.google.AssistantBroadcastTrait
import com.google.home.matter.standard.SpeakerDevice
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import java.security.MessageDigest
import java.util.UUID
import java.util.function.BooleanSupplier

/** The SDK keeps Google credentials. This app stores only a selected destination and request states. */
@OptIn(HomeExperimentalGenericApi::class, HomeExperimentalApi::class)
class HomeRemoteSdk(private val activity: ComponentActivity) : HomeRemote() {
    private var generation = 0
    private var closed = false
    private var job = SupervisorJob()
    private var scope = CoroutineScope(job + Dispatchers.Main.immediate)
    private val prefs = activity.getSharedPreferences("home_remote", Context.MODE_PRIVATE)
    // One client per process; activity teardown must not shut down a new activity's client.
    private val home = SharedClient.get(activity.applicationContext)
    private object SharedClient {
        private var client: HomeClient? = null
        @Synchronized fun get(context: Context): HomeClient {
            return client ?: Home.getClient(context, HomeConfig(
                coroutineContext = Dispatchers.IO + SupervisorJob(),
                factoryRegistry = FactoryRegistry(traits = listOf(AssistantBroadcast), types = listOf(SpeakerDevice))
            )).also { client = it }
        }
    }
    private val gates = mutableMapOf<String, RemoteSpeechGate>()
    private var settingUp = false
    private data class Destination(val structure: Structure, val candidate: CommandCandidate, val label: String)

    init { home.registerActivityResultCallerForPermissions(activity) }
    override fun available() = true
    private fun hash(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        .joinToString("") { "%02x".format(it) }
    private fun ownerKey(owner: String) = hash(owner)
    override fun configured(owner: String) = owner.isNotEmpty() && prefs.contains("target:${ownerKey(owner)}")
    override fun targetLabel(owner: String) = prefs.getString("label:${ownerKey(owner)}", "未設定") ?: "未設定"
    private fun current(expected: Int, check: BooleanSupplier) = !closed && generation == expected && check.asBoolean
    private suspend fun destinations(): List<Destination> = withTimeout(45_000) {
        home.structures().list().flatMap { structure ->
            structure.allCandidates().first().filterIsInstance<CommandCandidate>().filter {
                it.commandDescriptor == AssistantBroadcastTrait.BroadcastCommand && it.unsupportedReasons.isEmpty() &&
                    (it.entity is Structure || (it.entity is HomeDevice && it.types.contains(SpeakerDevice)))
            }.map { candidate ->
                val entity = candidate.entity
                Destination(structure, candidate, structure.name + " / " +
                    if (entity is Structure) "家全体のスピーカー" else (entity as HomeDevice).name)
            }
        }.distinctBy { "${it.structure.id}|${it.candidate.entity.id}" }
    }
    private fun target(destination: Destination) = "${destination.structure.id}|${destination.candidate.entity.id}"
    private fun failSetup(text: String) = AlertDialog.Builder(activity).setTitle("Google Homeの設定")
        .setMessage(text).setPositiveButton("閉じる", null).show()

    override fun setup(owner: String, current: BooleanSupplier, onConfigured: Runnable) {
        if (owner.isEmpty() || closed || settingUp || !current.asBoolean) return
        val expected = generation
        settingUp = true
        val status = TextView(activity).apply { text = "Googleの画面で家へのアクセスを許可してください"; setPadding(32,24,32,24) }
        val dialog = AlertDialog.Builder(activity).setTitle("外出先からの読み上げ先").setView(status)
            .setNegativeButton("中止", null).create()
        var setupJob: Job? = null
        dialog.setOnCancelListener { setupJob?.cancel() }
        dialog.setOnDismissListener { setupJob?.cancel() }
        dialog.show()
        setupJob = scope.launch {
            try {
                val result = home.requestPermissions(ForcePermissionFlow.FORCE_LAUNCH)
                if (!current(expected, current)) return@launch
                if (result.status != PermissionsResultStatus.SUCCESS) {
                    failSetup("権限を取得できませんでした。Android用OAuthと署名証明書の設定、Google Homeのアクセス許可を確認してください。")
                    return@launch
                }
                val choices = destinations()
                if (!current(expected, current)) return@launch
                if (choices.isEmpty()) {
                    failSetup("読み上げに対応する家・スピーカーが見つかりません。Google Homeの共有先とスピーカーの接続状態を確認してください。")
                } else {
                    AlertDialog.Builder(activity).setTitle("読み上げ先を選択")
                        .setItems(choices.map { it.label }.toTypedArray()) { _, index ->
                            if (current(expected, current)) {
                                val selected = choices[index]
                                val saved = prefs.edit().putString("target:${ownerKey(owner)}", target(selected))
                                    .putString("label:${ownerKey(owner)}", selected.label).commit()
                                if (saved) { onConfigured.run(); failSetup("設定しました。伝言送信時に読み上げをオンにできます。\n${selected.label}") }
                                else failSetup("設定を保存できませんでした。もう一度設定してください。")
                            }
                        }.setNegativeButton("閉じる", null).show()
                }
                cleanupOld(owner)
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                if (current(expected, current)) failSetup("設定を確認できませんでした。通信状態、Google Play開発者サービス、Android用OAuth設定を確認してください。")
            } finally {
                settingUp = false
                dialog.setOnDismissListener(null)
                dialog.dismiss()
            }
        }
    }

    override fun broadcast(owner: String, messageId: Int, text: String, current: BooleanSupplier, result: Result) {
        if (closed || !current.asBoolean) return
        if (!configured(owner) || messageId <= 0 || text.isBlank() || text.codePointCount(0, text.length) > 5000) {
            result.complete("SAFE_FAILED", "伝言は保存済みです。読み上げ先と本文を確認してください。")
            return
        }
        val expected = generation
        val key = "request:${ownerKey(owner)}:$messageId"
        val destinationKey = prefs.getString("target:${ownerKey(owner)}", "")!!
        val signature = hash(destinationKey + "\n" + text)
        if (prefs.contains("signature:$key") && prefs.getString("signature:$key", "") != signature) {
            result.complete("UNKNOWN", "この伝言の読み上げ先・内容が変更されています。重複を防ぐため再実行しません。")
            return
        }
        val gate = gates.getOrPut(key) {
            val saved = runCatching { RemoteSpeechGate.State.valueOf(prefs.getString(key, "NEW")!!) }.getOrDefault(RemoteSpeechGate.State.UNKNOWN)
            RemoteSpeechGate(RemoteSpeechGate.afterRestart(saved))
        }
        if (!gate.prepare()) {
            result.complete(gate.state().name, "既に読み上げ依頼中・受付済み、または結果不明です。自動で再実行しません。")
            return
        }
        if (!prefs.edit().putString(key, gate.state().name).putString("signature:$key", signature).commit()) {
            gate.failed(); result.complete("SAFE_FAILED", "要求状態を保存できませんでした。読み上げは依頼していません。"); return
        }
        scope.launch {
            var created: Automation? = null
            var structure: Structure? = null
            var pendingKey: String? = null
            try {
                withTimeout(60_000) {
                    val granted = home.hasPermissions().first { it != PermissionsState.PERMISSIONS_STATE_UNINITIALIZED }
                    check(granted == PermissionsState.GRANTED)
                    val destination = destinations().singleOrNull { target(it) == destinationKey }
                        ?: error("Target unavailable")
                    if (!current(expected, current)) throw CancellationException()
                    structure = destination.structure
                    val definition = automation {
                        name = "つちだけ 伝言読み上げ"
                        description = "tsuchidake-broadcast:v1:" + UUID.randomUUID().toString()
                        isActive = true
                        maxExecutionCount(1)
                        sequential {
                            manualStarter()
                            if (destination.candidate.entity is Structure) {
                                action(destination.structure) { command(AssistantBroadcast.broadcast(text)) }
                            } else {
                                action(destination.candidate.entity as HomeDevice, SpeakerDevice) {
                                    command(AssistantBroadcast.broadcast(text))
                                }
                            }
                        }
                    }
                    created = destination.structure.createAutomation(definition)
                    val ready = created
                    pendingKey = "pending:${ownerKey(owner)}:${ready.id}"
                    check(prefs.edit().putString(pendingKey, "${destination.structure.id}|${ready.id}|${System.currentTimeMillis()}").commit())
                    check(ready.isValid && ready.manuallyExecutable && ready.isActive)
                    if (!current(expected, current)) throw CancellationException()
                    // Persist BEFORE the non-idempotent call. A crash/timeout after this point is UNKNOWN.
                    check(prefs.edit().putString(key, "EXECUTING").commit())
                    check(gate.execute())
                    withTimeout(30_000) { ready.execute() }
                    gate.accepted()
                    val persisted = prefs.edit().putString(key, "ACCEPTED").commit()
                    if (current(expected, current)) result.complete(if (persisted) "ACCEPTED" else "UNKNOWN",
                        if (persisted) "伝言は保存済みです。Google Homeが読み上げ依頼を受け付けました。実際の音声を確認してください。"
                        else "読み上げ依頼の結果を保存できませんでした。重複を防ぐため再実行しません。")
                }
            } catch (error: Exception) {
                gate.failed()
                prefs.edit().putString(key, gate.state().name).commit()
                if (current(expected, current)) result.complete(gate.state().name,
                    if (gate.mayRetry()) "伝言は保存済みです。読み上げを依頼できませんでした。読み上げだけ再試行できます。"
                    else "伝言は保存済みです。読み上げ結果は不明です。重複を防ぐため自動で再実行しません。")
            } finally {
                val saved = created
                val parent = structure
                if (saved != null && parent != null) withContext(NonCancellable) {
                    runCatching {
                        withTimeout(150_000) {
                            if (!gate.mayRetry()) {
                                delay(3_000)
                                parent.automations().itemFlow(saved.id).first { !it.isRunning && !it.isActive }
                            }
                            parent.deleteAutomation(saved.id)
                            if (pendingKey != null) prefs.edit().remove(pendingKey).commit()
                        }
                    }
                }
            }
        }
    }
    private suspend fun cleanupOld(owner: String) {
        val prefix = "pending:${ownerKey(owner)}:"
        for ((key, value) in prefs.all) if (key.startsWith(prefix) && value is String) {
            val parts = value.split('|')
            if (parts.size != 3 || System.currentTimeMillis() - (parts[2].toLongOrNull() ?: 0) < 300_000) continue
            runCatching {
                withTimeout(15_000) {
                    val structure = home.structures().get(Id.of(parts[0])) ?: return@withTimeout
                    val automation = structure.automations().get(Id.of(parts[1]))
                    if (automation == null || !automation.isRunning) {
                        if (automation != null) structure.deleteAutomation(automation.id)
                        prefs.edit().remove(key).commit()
                    }
                }
            }
        }
    }
    override fun resetSession() { generation++; job.cancel(); gates.clear(); settingUp = false; job = SupervisorJob(); scope = CoroutineScope(job + Dispatchers.Main.immediate) }
    override fun close() { closed = true; generation++; job.cancel(); gates.clear() }
}
