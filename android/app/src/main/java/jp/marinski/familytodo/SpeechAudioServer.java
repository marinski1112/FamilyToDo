package jp.marinski.familytodo;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** One expiring, unguessable WAV URL. No cookies, messages API, or filesystem routing. */
final class SpeechAudioServer implements AutoCloseable {
    private final ServerSocket server;
    private final byte[] audio;
    private final String path="/"+UUID.randomUUID()+".wav";
    private final long expires=System.nanoTime()+600_000_000_000L;
    private volatile boolean closed;
    SpeechAudioServer(InetAddress address,File file)throws IOException {
        if(file.length()==0||file.length()>32*1024*1024)throw new IOException("Invalid audio size");
        audio=java.nio.file.Files.readAllBytes(file.toPath());
        server=new ServerSocket(0,4,address);server.setSoTimeout(1000);
        Thread worker=new Thread(()->{while(!closed&&System.nanoTime()<expires){try(Socket client=server.accept()){client.setSoTimeout(2000);serve(client);}catch(SocketTimeoutException ignored){}catch(IOException ignored){}}close();},"home-speech-audio");worker.setDaemon(true);worker.start();
    }
    String url(){return "http://"+server.getInetAddress().getHostAddress()+":"+server.getLocalPort()+path;}
    private void serve(Socket socket)throws IOException {
        BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII));
        String request=readLine(reader);if(request==null)return;String[] parts=request.split(" ");
        String range=null;int bytes=0;for(String line;(line=readLine(reader))!=null&&!line.isEmpty();){bytes+=line.length();if(bytes>8192)return;if(line.toLowerCase(java.util.Locale.ROOT).startsWith("range:"))range=line.substring(6).trim();}
        boolean head=parts.length>=2&&parts[0].equals("HEAD"),get=parts.length>=2&&parts[0].equals("GET");
        OutputStream out=socket.getOutputStream();
        if(parts.length<2||!parts[1].equals(path)||(!get&&!head)||closed||System.nanoTime()>=expires){out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));return;}
        int start=0,end=audio.length-1;boolean partial=range!=null;
        if(partial){try{if(!range.startsWith("bytes=")||range.contains(","))throw new IllegalArgumentException();String[] limits=range.substring(6).split("-",-1);if(limits.length!=2)throw new IllegalArgumentException();if(limits[0].isEmpty()){int suffix=Integer.parseInt(limits[1]);if(suffix<=0)throw new IllegalArgumentException();start=Math.max(0,audio.length-suffix);}else{start=Integer.parseInt(limits[0]);if(!limits[1].isEmpty())end=Math.min(end,Integer.parseInt(limits[1]));}if(start<0||start>=audio.length||end<start)throw new IllegalArgumentException();}catch(Exception invalid){out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */"+audio.length+"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));return;}}
        String headers="HTTP/1.1 "+(partial?"206 Partial Content":"200 OK")+"\r\nContent-Type: audio/wav\r\nContent-Length: "+(end-start+1)+"\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\n"+(partial?"Content-Range: bytes "+start+"-"+end+"/"+audio.length+"\r\n":"")+"Connection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.US_ASCII));if(!head)out.write(audio,start,end-start+1);
    }
    private String readLine(Reader reader)throws IOException {
        StringBuilder line=new StringBuilder();int c;
        while((c=reader.read())!=-1){if(c=='\n')return line.toString();if(c!='\r')line.append((char)c);if(line.length()>8192)throw new IOException("Request line too large");}
        return line.length()==0?null:line.toString();
    }
    @Override public void close(){closed=true;try{server.close();}catch(IOException ignored){}}
}
