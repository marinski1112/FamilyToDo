package jp.marinski.familytodo;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
public final class RemoteSpeechGateTest {
    private static void require(boolean ok) { if(!ok)throw new AssertionError(); }
    public static void main(String[] args) throws Exception {
        RemoteSpeechGate safe=new RemoteSpeechGate(RemoteSpeechGate.State.NEW);
        require(safe.prepare());safe.failed();require(safe.mayRetry());require(safe.prepare());require(safe.execute());
        safe.failed();require(safe.state()==RemoteSpeechGate.State.UNKNOWN);require(!safe.prepare());
        RemoteSpeechGate success=new RemoteSpeechGate(RemoteSpeechGate.State.NEW);
        require(success.prepare());require(success.execute());success.accepted();success.failed();require(!success.prepare());
        require(success.state()==RemoteSpeechGate.State.ACCEPTED);
        require(RemoteSpeechGate.afterRestart(RemoteSpeechGate.State.PREPARING)==RemoteSpeechGate.State.SAFE_FAILED);
        require(RemoteSpeechGate.afterRestart(RemoteSpeechGate.State.EXECUTING)==RemoteSpeechGate.State.UNKNOWN);
        for(RemoteSpeechGate.State state:new RemoteSpeechGate.State[]{RemoteSpeechGate.State.ACCEPTED,RemoteSpeechGate.State.UNKNOWN}) {
            RemoteSpeechGate restored=new RemoteSpeechGate(RemoteSpeechGate.afterRestart(state));require(!restored.prepare());require(!restored.execute());
        }
        RemoteSpeechGate concurrent=new RemoteSpeechGate(RemoteSpeechGate.State.NEW);
        CountDownLatch start=new CountDownLatch(1);AtomicInteger winners=new AtomicInteger();Thread[] threads=new Thread[32];
        for(int i=0;i<threads.length;i++){threads[i]=new Thread(()->{try{start.await();if(concurrent.prepare())winners.incrementAndGet();}catch(InterruptedException e){throw new AssertionError(e);}});threads[i].start();}
        start.countDown();for(Thread thread:threads)thread.join();require(winners.get()==1);require(concurrent.execute());require(!concurrent.execute());
        System.out.println("Remote speech gate: failure, restart, accepted and concurrent duplicate checks passed");
    }
}
