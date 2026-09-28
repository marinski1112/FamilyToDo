package jp.marinski.familytodo;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.CookieManager;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.KeyStore;
import java.time.YearMonth;
import java.io.ByteArrayOutputStream;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-local encrypted read-only snapshot. Never put family rows in WebView CacheStorage. */
final class SnapshotCache {
    private static final String ALIAS="familytodo_snapshot_v1";
    private static final long MAX_AGE_MS=7L*24*60*60*1000;
    private static final int MAX_STAMP_FILES=64;
    private static final long MAX_STAMP_BYTES=24L*1024*1024;
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
    private static File placementsFile(Context context,String month) {
        YearMonth.parse(month);
        return new File(context.getFilesDir(),"placements-"+month+".enc");
    }
    private static File familyLogFile(Context context,String day) {
        if(!day.matches("20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])")||
            !java.time.LocalDate.parse(day).toString().equals(day)) throw new IllegalArgumentException("Invalid day");
        return new File(context.getFilesDir(),"family-log-"+day+".enc");
    }
    private static String sessionBinding() throws Exception {
        String cookie=CookieManager.getInstance().getCookie(ApiClient.ORIGIN);
        if(cookie==null || cookie.isEmpty()) return null;
        for(String part:cookie.split(";")) {
            String value=part.trim();
            if(!value.startsWith("family_line_cf=") || value.length()<"family_line_cf=".length()+16) continue;
            byte[] digest=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(digest,Base64.NO_WRAP);
        }
        return null;
    }
    private static File stampFile(Context context,String path) throws Exception {
        if(!path.matches("/api/calendar-stamp-media\\?asset=[1-9][0-9]*(?:&variant=thumbnail|&frame=[0-9]+)?") &&
           !(path.startsWith("/")&&!path.contains("?")&&!path.contains("..")&&
             (path.endsWith(".png")||path.endsWith(".webp")||path.endsWith(".gif"))))
            throw new IllegalArgumentException("Invalid stamp path");
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(path.getBytes(StandardCharsets.UTF_8));
        StringBuilder name=new StringBuilder("stamp-");
        for(byte b:hash) name.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        return new File(context.getFilesDir(),name+".enc");
    }
    private static File animationFile(Context context,String path) throws Exception {
        if(!path.matches("/api/calendar-stamp-media\\?asset=[1-9][0-9]*&variant=full") &&
           !(path.startsWith("/")&&!path.startsWith("//")&&!path.contains("?")&&!path.contains("..")&&
             (path.endsWith(".gif")||path.endsWith(".webp")))) throw new IllegalArgumentException("Invalid animation path");
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(path.getBytes(StandardCharsets.UTF_8));
        StringBuilder name=new StringBuilder("animation-");
        for(byte b:hash) name.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        return new File(context.getFilesDir(),name+".enc");
    }
    static void writeAnimation(Context context,String path,byte[] bytes) {
        try {
            if(bytes.length==0||bytes.length>4*1024*1024) return;
            String binding=sessionBinding();if(binding==null) return;
            JSONObject payload=new JSONObject().put("savedAt",System.currentTimeMillis())
                .put("sessionBinding",binding).put("path",path)
                .put("data",Base64.encodeToString(bytes,Base64.NO_WRAP));
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
            JSONObject record=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
                .put("value",Base64.encodeToString(cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
            File target=animationFile(context,path),temporary=new File(target.getAbsolutePath()+".tmp");
            Files.write(temporary.toPath(),record.toString().getBytes(StandardCharsets.UTF_8));
            if(!temporary.renameTo(target)) temporary.delete();
            pruneAnimations(context);
        } catch(Exception ignored) { }
    }
    static byte[] readAnimation(Context context,String path) {
        try {
            File target=animationFile(context,path);
            if(!target.isFile()||target.length()>7_500_000) return null;
            JSONObject record=new JSONObject(new String(Files.readAllBytes(target.toPath()),StandardCharsets.UTF_8));
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(record.getString("iv"),Base64.DEFAULT)));
            JSONObject payload=new JSONObject(new String(cipher.doFinal(Base64.decode(record.getString("value"),Base64.DEFAULT)),StandardCharsets.UTF_8));
            String binding=sessionBinding();long age=System.currentTimeMillis()-payload.getLong("savedAt");
            if(binding==null||!MessageDigest.isEqual(binding.getBytes(StandardCharsets.UTF_8),
                payload.optString("sessionBinding").getBytes(StandardCharsets.UTF_8))||
                age<0||age>MAX_AGE_MS||!path.equals(payload.optString("path"))) return null;
            byte[] bytes=Base64.decode(payload.getString("data"),Base64.DEFAULT);
            if(bytes.length==0||bytes.length>4*1024*1024) return null;
            target.setLastModified(System.currentTimeMillis());return bytes;
        } catch(Exception ignored) { return null; }
    }
    private static void pruneAnimations(Context context) {
        File[] files=context.getFilesDir().listFiles((dir,name)->name.startsWith("animation-")&&name.endsWith(".enc"));
        if(files==null) return;
        java.util.Arrays.sort(files,(a,b)->Long.compare(b.lastModified(),a.lastModified()));
        long total=0;
        for(int i=0;i<files.length;i++) {
            total+=files[i].length();
            if(i>=4||total>20L*1024*1024||System.currentTimeMillis()-files[i].lastModified()>MAX_AGE_MS) {
                total-=files[i].length();files[i].delete();
            }
        }
    }
    static void writeStamp(Context context,String path,Bitmap image) {
        try {
            String binding=sessionBinding(); if(binding==null) return;
            ByteArrayOutputStream png=new ByteArrayOutputStream();
            if(!image.compress(Bitmap.CompressFormat.PNG,100,png)||png.size()>1_000_000) return;
            JSONObject payload=new JSONObject().put("savedAt",System.currentTimeMillis())
                .put("sessionBinding",binding).put("path",path)
                .put("png",Base64.encodeToString(png.toByteArray(),Base64.NO_WRAP));
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
            byte[] encrypted=cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));
            JSONObject record=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
                .put("value",Base64.encodeToString(encrypted,Base64.NO_WRAP));
            File target=stampFile(context,path),temporary=new File(target.getAbsolutePath()+".tmp");
            Files.write(temporary.toPath(),record.toString().getBytes(StandardCharsets.UTF_8));
            if(!temporary.renameTo(target)) temporary.delete();
            pruneStamps(context);
        } catch(Exception ignored) { /* Best-effort cache only. */ }
    }
    static Bitmap readStamp(Context context,String path) {
        try {
            File target=stampFile(context,path);
            if(!target.isFile()||target.length()>1_500_000) return null;
            JSONObject record=new JSONObject(new String(Files.readAllBytes(target.toPath()),StandardCharsets.UTF_8));
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(record.getString("iv"),Base64.DEFAULT)));
            JSONObject payload=new JSONObject(new String(cipher.doFinal(Base64.decode(record.getString("value"),Base64.DEFAULT)),StandardCharsets.UTF_8));
            String binding=sessionBinding();long age=System.currentTimeMillis()-payload.getLong("savedAt");
            if(binding==null||!MessageDigest.isEqual(binding.getBytes(StandardCharsets.UTF_8),
                payload.optString("sessionBinding").getBytes(StandardCharsets.UTF_8))||
                age<0||age>MAX_AGE_MS||!path.equals(payload.optString("path"))) return null;
            byte[] bytes=Base64.decode(payload.getString("png"),Base64.DEFAULT);
            if(bytes.length>1_000_000) return null;
            BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
            BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            if(options.outWidth<=0||options.outHeight<=0||options.outWidth>1024||options.outHeight>1024) return null;
            Bitmap decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
            if(decoded!=null) target.setLastModified(System.currentTimeMillis());
            return decoded;
        } catch(Exception ignored) { return null; }
    }
    private static void pruneStamps(Context context) {
        File[] files=context.getFilesDir().listFiles((dir,name)->name.startsWith("stamp-")&&name.endsWith(".enc"));
        if(files==null) return;
        java.util.Arrays.sort(files,(a,b)->Long.compare(b.lastModified(),a.lastModified()));
        long total=0;
        for(int i=0;i<files.length;i++) {
            total+=files[i].length();
            if(i>=MAX_STAMP_FILES||total>MAX_STAMP_BYTES||System.currentTimeMillis()-files[i].lastModified()>MAX_AGE_MS) {
                total-=files[i].length();files[i].delete();
            }
        }
    }
    static void write(Context context,String month,JSONObject data) {
        try {
            if(!month.equals(data.optString("month"))||!data.optBoolean("ok")||data.optInt("schemaVersion")!=1) return;
            String binding=sessionBinding(); if(binding==null) return;
            JSONObject wrapper=new JSONObject().put("savedAt",System.currentTimeMillis())
                .put("sessionBinding",binding).put("data",data);
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
            String binding=sessionBinding();
            if(binding==null || !MessageDigest.isEqual(binding.getBytes(StandardCharsets.UTF_8),
                wrapper.optString("sessionBinding").getBytes(StandardCharsets.UTF_8))) return null;
            long age=System.currentTimeMillis()-wrapper.getLong("savedAt");
            if(age<0||age>MAX_AGE_MS) return null;
            JSONObject data=wrapper.getJSONObject("data");
            return month.equals(data.optString("month"))&&data.optBoolean("ok")&&data.optInt("schemaVersion")==1?data:null;
        } catch(Exception ignored) { return null; }
    }
    static void writePlacements(Context context,String month,JSONArray stamps) {
        try {
            String binding=sessionBinding();if(binding==null||stamps.length()>500) return;
            JSONObject payload=new JSONObject().put("month",month).put("savedAt",System.currentTimeMillis())
                .put("sessionBinding",binding).put("stamps",stamps);
            byte[] source=payload.toString().getBytes(StandardCharsets.UTF_8);
            if(source.length>1_000_000) return;
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
            JSONObject record=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
                .put("value",Base64.encodeToString(cipher.doFinal(source),Base64.NO_WRAP));
            File target=placementsFile(context,month),temporary=new File(target.getAbsolutePath()+".tmp");
            Files.write(temporary.toPath(),record.toString().getBytes(StandardCharsets.UTF_8));
            if(!temporary.renameTo(target)) temporary.delete();
            prune(context,month);
        } catch(Exception ignored) { }
    }
    static JSONArray readPlacements(Context context,String month) {
        try {
            File target=placementsFile(context,month);
            if(!target.isFile()||target.length()>1_500_000) return null;
            JSONObject record=new JSONObject(new String(Files.readAllBytes(target.toPath()),StandardCharsets.UTF_8));
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(record.getString("iv"),Base64.DEFAULT)));
            JSONObject payload=new JSONObject(new String(cipher.doFinal(Base64.decode(record.getString("value"),Base64.DEFAULT)),StandardCharsets.UTF_8));
            String binding=sessionBinding();long age=System.currentTimeMillis()-payload.getLong("savedAt");
            if(binding==null||!MessageDigest.isEqual(binding.getBytes(StandardCharsets.UTF_8),
                payload.optString("sessionBinding").getBytes(StandardCharsets.UTF_8))||
                age<0||age>MAX_AGE_MS||!month.equals(payload.optString("month"))) return null;
            JSONArray stamps=payload.getJSONArray("stamps");return stamps.length()<=500?stamps:null;
        } catch(Exception ignored) { return null; }
    }
    static void writeFamilyLog(Context context,String day,JSONObject data) {
        try {
            if(!day.equals(data.optString("date"))||!data.optBoolean("ok")||data.optInt("schemaVersion")!=1) return;
            String binding=sessionBinding();if(binding==null) return;
            JSONObject payload=new JSONObject().put("savedAt",System.currentTimeMillis())
                .put("sessionBinding",binding).put("data",data);
            byte[] source=payload.toString().getBytes(StandardCharsets.UTF_8);
            if(source.length>2_000_000) return;
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
            JSONObject record=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
                .put("value",Base64.encodeToString(cipher.doFinal(source),Base64.NO_WRAP));
            File target=familyLogFile(context,day),temporary=new File(target.getAbsolutePath()+".tmp");
            Files.write(temporary.toPath(),record.toString().getBytes(StandardCharsets.UTF_8));
            if(!temporary.renameTo(target)) temporary.delete();
            pruneFamilyLogs(context);
        } catch(Exception ignored) { }
    }
    static JSONObject readFamilyLog(Context context,String day) {
        try {
            File target=familyLogFile(context,day);
            if(!target.isFile()||target.length()>3_000_000) return null;
            JSONObject record=new JSONObject(new String(Files.readAllBytes(target.toPath()),StandardCharsets.UTF_8));
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(record.getString("iv"),Base64.DEFAULT)));
            JSONObject payload=new JSONObject(new String(cipher.doFinal(Base64.decode(record.getString("value"),Base64.DEFAULT)),StandardCharsets.UTF_8));
            String binding=sessionBinding();long age=System.currentTimeMillis()-payload.getLong("savedAt");
            if(binding==null||!MessageDigest.isEqual(binding.getBytes(StandardCharsets.UTF_8),
                payload.optString("sessionBinding").getBytes(StandardCharsets.UTF_8))||age<0||age>MAX_AGE_MS) return null;
            JSONObject data=payload.getJSONObject("data");
            return day.equals(data.optString("date"))&&data.optBoolean("ok")&&data.optInt("schemaVersion")==1?data:null;
        } catch(Exception ignored) { return null; }
    }
    private static void pruneFamilyLogs(Context context) {
        File[] files=context.getFilesDir().listFiles((dir,name)->name.startsWith("family-log-")&&name.endsWith(".enc"));
        if(files==null) return;
        java.util.Arrays.sort(files,(a,b)->Long.compare(b.lastModified(),a.lastModified()));
        for(int i=0;i<files.length;i++)
            if(i>=7||System.currentTimeMillis()-files[i].lastModified()>MAX_AGE_MS) files[i].delete();
    }
    private static void prune(Context context,String current) {
        YearMonth center=YearMonth.parse(current);
        File[] files=context.getFilesDir().listFiles((dir,name)->
            (name.startsWith("month-")||name.startsWith("placements-"))&&name.endsWith(".enc"));
        if(files==null) return;
        for(File f:files) {
            try {
                String month=f.getName().startsWith("month-")?f.getName().substring(6,13):f.getName().substring(11,18);
                long distance=Math.abs(java.time.temporal.ChronoUnit.MONTHS.between(center,YearMonth.parse(month)));
                if(distance>2) f.delete();
            } catch(Exception ignored) { f.delete(); }
        }
    }
    static void clear(Context context) {
        File[] files=context.getFilesDir().listFiles((dir,name)->
            (name.startsWith("month-")||name.startsWith("stamp-")||name.startsWith("placements-")||name.startsWith("animation-")||name.startsWith("family-log-"))&&
            (name.endsWith(".enc")||name.endsWith(".enc.tmp")));
        if(files!=null) for(File f:files) f.delete();
    }
}
