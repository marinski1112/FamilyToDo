package jp.marinski.familytodo;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** One expiring, unguessable WAV URL. No cookies, messages API, or filesystem routing. */
final class SpeechAudioServer implements AutoCloseable {
    private static final java.util.concurrent.ScheduledExecutorService EXPIRER=java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"speech-expiry");t.setDaemon(true);return t;});
    private final java.util.concurrent.ScheduledFuture<?> expiry;
    private volatile Socket active;
    private final ServerSocket server;
    private final byte[] audio;
    private final String path="/"+UUID.randomUUID()+".wav";
    private final long expires;
    private volatile boolean closed;
    SpeechAudioServer(InetAddress address,File file)throws IOException {this(address,file,600000);}
    SpeechAudioServer(InetAddress address,File file,long lifetimeMillis)throws IOException {
        if(lifetimeMillis<=0)throw new IOException("Invalid lifetime");
        expires=System.nanoTime()+java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(lifetimeMillis);
        if(file.length()==0||file.length()>32*1024*1024)throw new IOException("Invalid audio size");
        audio=java.nio.file.Files.readAllBytes(file.toPath());
        server=new ServerSocket(0,4,address);server.setSoTimeout(1000);
        expiry=EXPIRER.schedule(this::close,lifetimeMillis,java.util.concurrent.TimeUnit.MILLISECONDS);
        Thread worker=new Thread(()->{while(!closed&&System.nanoTime()<expires){try(Socket client=server.accept()){active=client;if(closed)break;client.setSoTimeout(2000);serve(client);}catch(SocketTimeoutException ignored){}catch(IOException ignored){}finally{active=null;}}close();},"home-speech-audio");worker.setDaemon(true);worker.start();
    }
    String url(){return "http://"+server.getInetAddress().getHostAddress()+":"+server.getLocalPort()+path;}
    private void serve(Socket socket)throws IOException {
        BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII));
        int[] budget={16384};long deadline=System.nanoTime()+3_000_000_000L;
        String request=readLine(reader,budget,deadline);if(request==null)return;String[] parts=request.split(" ");
        String range=null;while(true){String line=readLine(reader,budget,deadline);if(line==null)return;if(line.isEmpty())break;if(line.toLowerCase(java.util.Locale.ROOT).startsWith("range:"))range=line.substring(6).trim();}
        boolean head=parts.length>=2&&parts[0].equals("HEAD"),get=parts.length>=2&&parts[0].equals("GET");
        OutputStream out=socket.getOutputStream();
        if(parts.length<2||!parts[1].equals(path)||(!get&&!head)||closed||System.nanoTime()>=expires){out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));return;}
        int start=0,end=audio.length-1;boolean partial=range!=null;
        if(partial){try{if(!range.startsWith("bytes=")||range.contains(","))throw new IllegalArgumentException();String[] limits=range.substring(6).split("-",-1);if(limits.length!=2)throw new IllegalArgumentException();if(limits[0].isEmpty()){int suffix=Integer.parseInt(limits[1]);if(suffix<=0)throw new IllegalArgumentException();start=Math.max(0,audio.length-suffix);}else{start=Integer.parseInt(limits[0]);if(!limits[1].isEmpty())end=Math.min(end,Integer.parseInt(limits[1]));}if(start<0||start>=audio.length||end<start)throw new IllegalArgumentException();}catch(Exception invalid){out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */"+audio.length+"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));return;}}
        String headers="HTTP/1.1 "+(partial?"206 Partial Content":"200 OK")+"\r\nContent-Type: audio/wav\r\nContent-Length: "+(end-start+1)+"\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\n"+(partial?"Content-Range: bytes "+start+"-"+end+"/"+audio.length+"\r\n":"")+"Connection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.US_ASCII));if(!head)out.write(audio,start,end-start+1);
    }
    private String readLine(Reader reader,int[] budget,long deadline)throws IOException {
        StringBuilder line=new StringBuilder();int c;
        while((c=reader.read())!=-1){if(--budget[0]<0||System.nanoTime()>deadline||closed)throw new IOException("Request limit exceeded");if(c=='\n')return line.toString();if(c!='\r')line.append((char)c);if(line.length()>8192)throw new IOException("Request line too large");}
        return null;
    }
    @Override public void close(){closed=true;if(expiry!=null)expiry.cancel(false);try{server.close();}catch(IOException ignored){}Socket client=active;if(client!=null)try{client.close();}catch(IOException ignored){}}
}
