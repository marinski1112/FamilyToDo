package jp.marinski.familytodo;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class Credentials {
    private static final String ALIAS = "familytodo_location_v1";
    private Credentials() {}
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static void save(Context context, String id, String secret) throws Exception {
        if (!id.matches("loc_[0-9a-fA-F]{32}") || !secret.matches("[0-9a-fA-F]{64}")) throw new IllegalArgumentException("端末IDまたはSecretの形式を確認してください");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal((id + ":" + secret).getBytes(StandardCharsets.UTF_8));
        context.getSharedPreferences("device", 0).edit()
            .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString("value", Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply();
    }
    static String read(Context context) {
        try {
            var prefs = context.getSharedPreferences("device", 0);
            byte[] iv = Base64.decode(prefs.getString("iv", ""), Base64.DEFAULT);
            byte[] value = Base64.decode(prefs.getString("value", ""), Base64.DEFAULT);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(value), StandardCharsets.UTF_8);
        } catch (Exception ignored) { return null; }
    }
    static boolean sharingEnabled(Context context) {
        return context.getSharedPreferences("device", 0).getBoolean("sharing_enabled", false);
    }
    static void setSharingEnabled(Context context, boolean enabled) {
        context.getSharedPreferences("device", 0).edit().putBoolean("sharing_enabled", enabled).commit();
    }
    static void clear(Context context) { context.getSharedPreferences("device", 0).edit().clear().commit(); }
}
