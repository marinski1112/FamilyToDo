package jp.marinski.familytodo;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

/** Bounded image normalization and an idempotent upload to the existing message photo API. */
final class MessagePhotoUpload {
    static final class Draft {
        final byte[] jpeg; final String sourceHash,uploadId;
        Draft(byte[] jpeg,String sourceHash) { this.jpeg=jpeg; this.sourceHash=sourceHash; uploadId=UUID.randomUUID().toString(); }
    }
    static final class PngDraft {
        final byte[] png; final int width,height;
        PngDraft(byte[] png,int width,int height) { this.png=png; this.width=width; this.height=height; }
    }
    private MessagePhotoUpload() { }
    static Draft prepare(Context context,Uri uri) throws Exception {
        ByteArrayOutputStream raw=new ByteArrayOutputStream();
        try(InputStream input=context.getContentResolver().openInputStream(uri)) {
            if(input==null) throw new IllegalArgumentException("写真を開けません");
            byte[] buffer=new byte[8192]; int n;
            while((n=input.read(buffer))!=-1) {
                raw.write(buffer,0,n);
                if(raw.size()>20*1024*1024) throw new IllegalArgumentException("写真が大きすぎます");
            }
        }
        byte[] original=raw.toByteArray();
        if(original.length==0) throw new IllegalArgumentException("写真が空です");
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(original);
        StringBuilder hex=new StringBuilder(); for(byte b:hash) hex.append(String.format(java.util.Locale.ROOT,"%02x",b&0xff));
        BitmapFactory.Options options=new BitmapFactory.Options(); options.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(original,0,original.length,options);
        if(options.outWidth<1||options.outHeight<1||options.outWidth>16000||options.outHeight>16000)
            throw new IllegalArgumentException("写真のサイズを確認してください");
        options.inJustDecodeBounds=false; options.inSampleSize=1;
        while(options.outWidth/options.inSampleSize>1600||options.outHeight/options.inSampleSize>1600) options.inSampleSize*=2;
        Bitmap decoded=BitmapFactory.decodeByteArray(original,0,original.length,options);
        if(decoded==null) throw new IllegalArgumentException("写真を読み込めません");
        Bitmap oriented=decoded,output=null;
        try {
            int orientation=ExifInterface.ORIENTATION_NORMAL;
            try { orientation=new ExifInterface(new ByteArrayInputStream(original)).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL); } catch(Exception ignored) { }
            Matrix transform=new Matrix();
            if(orientation==ExifInterface.ORIENTATION_FLIP_HORIZONTAL||orientation==ExifInterface.ORIENTATION_TRANSPOSE||orientation==ExifInterface.ORIENTATION_TRANSVERSE)
                transform.postScale(-1,1);
            if(orientation==ExifInterface.ORIENTATION_FLIP_VERTICAL) transform.postScale(1,-1);
            if(orientation==ExifInterface.ORIENTATION_ROTATE_90||orientation==ExifInterface.ORIENTATION_TRANSPOSE) transform.postRotate(90);
            if(orientation==ExifInterface.ORIENTATION_ROTATE_180) transform.postRotate(180);
            if(orientation==ExifInterface.ORIENTATION_ROTATE_270||orientation==ExifInterface.ORIENTATION_TRANSVERSE) transform.postRotate(270);
            if(!transform.isIdentity()) oriented=Bitmap.createBitmap(decoded,0,0,decoded.getWidth(),decoded.getHeight(),transform,true);
            float scale=Math.min(1f,800f/Math.max(oriented.getWidth(),oriented.getHeight()));
            int width=Math.max(1,Math.round(oriented.getWidth()*scale)),height=Math.max(1,Math.round(oriented.getHeight()*scale));
            output=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(output); canvas.drawColor(Color.WHITE);
            canvas.drawBitmap(oriented,null,new android.graphics.Rect(0,0,width,height),null);
            ByteArrayOutputStream jpeg=new ByteArrayOutputStream();
            if(!output.compress(Bitmap.CompressFormat.JPEG,88,jpeg)||jpeg.size()>4*1024*1024)
                throw new IllegalArgumentException("写真を圧縮できません");
            return new Draft(jpeg.toByteArray(),hex.toString());
        } finally {
            if(output!=null) output.recycle();
            if(oriented!=decoded) oriented.recycle(); decoded.recycle();
        }
    }
    static PngDraft prepareStamp(Context context,Uri uri) throws Exception {
        return prepareStamp(context,uri,512);
    }
    static PngDraft prepareStamp(Context context,Uri uri,int maxEdge) throws Exception {
        if(maxEdge<1||maxEdge>512) throw new IllegalArgumentException("Invalid stamp size");
        ByteArrayOutputStream raw=new ByteArrayOutputStream();
        try(InputStream input=context.getContentResolver().openInputStream(uri)) {
            if(input==null) throw new IllegalArgumentException("画像を開けません");
            byte[] buffer=new byte[8192];int n;
            while((n=input.read(buffer))!=-1) { raw.write(buffer,0,n); if(raw.size()>20*1024*1024) throw new IllegalArgumentException("画像が大きすぎます"); }
        }
        byte[] original=raw.toByteArray();
        BitmapFactory.Options options=new BitmapFactory.Options(); options.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(original,0,original.length,options);
        if(options.outWidth<1||options.outHeight<1||options.outWidth>16000||options.outHeight>16000)
            throw new IllegalArgumentException("画像のサイズを確認してください");
        options.inJustDecodeBounds=false; options.inSampleSize=1;
        while(options.outWidth/options.inSampleSize>1024||options.outHeight/options.inSampleSize>1024) options.inSampleSize*=2;
        Bitmap decoded=BitmapFactory.decodeByteArray(original,0,original.length,options);
        if(decoded==null) throw new IllegalArgumentException("画像を読み込めません");
        Bitmap oriented=decoded,output=null;
        try {
            int orientation=ExifInterface.ORIENTATION_NORMAL;
            try { orientation=new ExifInterface(new ByteArrayInputStream(original)).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL); } catch(Exception ignored) { }
            Matrix transform=new Matrix();
            if(orientation==ExifInterface.ORIENTATION_FLIP_HORIZONTAL||orientation==ExifInterface.ORIENTATION_TRANSPOSE||orientation==ExifInterface.ORIENTATION_TRANSVERSE) transform.postScale(-1,1);
            if(orientation==ExifInterface.ORIENTATION_FLIP_VERTICAL) transform.postScale(1,-1);
            if(orientation==ExifInterface.ORIENTATION_ROTATE_90||orientation==ExifInterface.ORIENTATION_TRANSPOSE) transform.postRotate(90);
            if(orientation==ExifInterface.ORIENTATION_ROTATE_180) transform.postRotate(180);
            if(orientation==ExifInterface.ORIENTATION_ROTATE_270||orientation==ExifInterface.ORIENTATION_TRANSVERSE) transform.postRotate(270);
            if(!transform.isIdentity()) oriented=Bitmap.createBitmap(decoded,0,0,decoded.getWidth(),decoded.getHeight(),transform,true);
            float scale=Math.min(1f,(float)maxEdge/Math.max(oriented.getWidth(),oriented.getHeight()));
            int width=Math.max(1,Math.round(oriented.getWidth()*scale)),height=Math.max(1,Math.round(oriented.getHeight()*scale));
            output=Bitmap.createScaledBitmap(oriented,width,height,true);
            ByteArrayOutputStream png=new ByteArrayOutputStream();
            if(!output.compress(Bitmap.CompressFormat.PNG,100,png)||png.size()>4*1024*1024)
                throw new IllegalArgumentException("PNGを圧縮できません");
            return new PngDraft(png.toByteArray(),width,height);
        } finally {
            if(output!=null&&output!=oriented) output.recycle();
            if(oriented!=decoded) oriented.recycle(); decoded.recycle();
        }
    }
    private static void field(OutputStream out,String boundary,String name,String value) throws Exception {
        out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+name+"\"\r\n\r\n"+value+"\r\n")
            .getBytes(StandardCharsets.UTF_8));
    }
    static JSONObject send(Draft draft,String csrf,String caption,String reminder) throws Exception {
        String boundary="FamilyToDo"+draft.uploadId.replace("-","");
        HttpURLConnection connection=(HttpURLConnection)new URL(ApiClient.ORIGIN+"/api/messages?photo=upload").openConnection();
        try {
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST"); connection.setDoOutput(true);
            connection.setRequestProperty("Accept","application/json");
            connection.setRequestProperty("Content-Type","multipart/form-data; boundary="+boundary);
            connection.setRequestProperty("x-csrf-token",csrf);
            String cookies=CookieManager.getInstance().getCookie(ApiClient.ORIGIN);
            if(cookies!=null) connection.setRequestProperty("Cookie",cookies);
            try(OutputStream out=connection.getOutputStream()) {
                field(out,boundary,"upload_id",draft.uploadId);
                field(out,boundary,"source_sha256",draft.sourceHash);
                field(out,boundary,"caption",caption);
                field(out,boundary,"reminder_at",reminder);
                out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n"+
                    "Content-Type: image/jpeg\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                out.write(draft.jpeg);
                out.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
            }
            int status=connection.getResponseCode();
            String setCookie=connection.getHeaderField("Set-Cookie");
            if(setCookie!=null) { CookieManager.getInstance().setCookie(ApiClient.ORIGIN,setCookie); CookieManager.getInstance().flush(); }
            if(status==401) throw new SecurityException("ログインしてください");
            try(InputStream in=status<400?connection.getInputStream():connection.getErrorStream()) {
                if(in==null) throw new IllegalStateException("応答がありません");
                ByteArrayOutputStream response=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
                while((n=in.read(buffer))!=-1) { response.write(buffer,0,n); if(response.size()>65536) throw new IllegalStateException("応答が大きすぎます"); }
                JSONObject result=new JSONObject(response.toString("UTF-8"));
                if(status>=400||!result.optBoolean("ok")) throw new IllegalStateException(result.optString("error","送信できませんでした"));
                return result;
            }
        } finally { connection.disconnect(); }
    }
}
