package jp.marinski.familytodo;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.time.YearMonth;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-local encrypted read-only snapshot. Never put family rows in WebView CacheStorage. */
final class SnapshotCache {
    private static final String ALIAS="familytodo_snapshot_v1";
    private static final long MAX_AGE_MS=7L*24*60*60*1000;
    private SnapshotCache() {}
    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if(store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private static File file(Context context,String month) {
        YearMonth.parse(month); // Only ISO YYYY-MM may be used as a filename.
        return new File(context.getFilesDir(),"month-"+month+".enc");
    }
    static void write(Context context,String month,JSONObject data) {
        try {
            if(!month.equals(data.optString("month"))||!data.optBoolean("ok")) return;
            JSONObject wrapper=new JSONObject().put("savedAt",System.currentTimeMillis()).put("data",data);
            byte[] source=wrapper.toString().getBytes(StandardCharsets.UTF_8);
            if(source.length>2_000_000) return;
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
            byte[] encrypted=cipher.doFinal(source);
            JSONObject record=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
                .put("value",Base64.encodeToString(encrypted,Base64.NO_WRAP));
            File target=file(context,month), temporary=new File(target.getAbsolutePath()+".tmp");
            Files.write(temporary.toPath(),record.toString().getBytes(StandardCharsets.UTF_8));
            if(!temporary.renameTo(target)) temporary.delete();
            prune(context,month);
        } catch(Exception ignored) { /* Cache failure must not change the server result. */ }
    }
    static JSONObject read(Context context,String month) {
        try {
            File target=file(context,month);
            if(!target.isFile()||target.length()>3_000_000) return null;
            JSONObject record=new JSONObject(new String(Files.readAllBytes(target.toPath()),StandardCharsets.UTF_8));
            byte[] iv=Base64.decode(record.getString("iv"),Base64.DEFAULT);
            byte[] value=Base64.decode(record.getString("value"),Base64.DEFAULT);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
            JSONObject wrapper=new JSONObject(new String(cipher.doFinal(value),StandardCharsets.UTF_8));
            long age=System.currentTimeMillis()-wrapper.getLong("savedAt");
            if(age<0||age>MAX_AGE_MS) return null;
            JSONObject data=wrapper.getJSONObject("data");
            return month.equals(data.optString("month"))&&data.optBoolean("ok")?data:null;
        } catch(Exception ignored) { return null; }
    }
    private static void prune(Context context,String current) {
        YearMonth center=YearMonth.parse(current);
        File[] files=context.getFilesDir().listFiles((dir,name)->name.startsWith("month-")&&name.endsWith(".enc"));
        if(files==null) return;
        for(File f:files) {
            try {
                String month=f.getName().substring(6,13);
                long distance=Math.abs(java.time.temporal.ChronoUnit.MONTHS.between(center,YearMonth.parse(month)));
                if(distance>2) f.delete();
            } catch(Exception ignored) { f.delete(); }
        }
    }
    static void clear(Context context) {
        File[] files=context.getFilesDir().listFiles((dir,name)->name.startsWith("month-")&&name.endsWith(".enc"));
        if(files!=null) for(File f:files) f.delete();
    }
}
