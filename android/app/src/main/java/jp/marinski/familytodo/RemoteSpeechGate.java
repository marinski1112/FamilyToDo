package jp.marinski.familytodo;

/** A saved message can reach the non-idempotent execute call at most once without user review. */
public final class RemoteSpeechGate {
    public enum State { NEW, PREPARING, SAFE_FAILED, EXECUTING, ACCEPTED, UNKNOWN }
    private State state;
    public RemoteSpeechGate(State initial) { state=initial; }
    public synchronized State state(){return state;}
    public synchronized boolean prepare(){
        if(state!=State.NEW&&state!=State.SAFE_FAILED)return false;
        state=State.PREPARING;return true;
    }
    public synchronized boolean execute(){
        if(state!=State.PREPARING)return false;
        state=State.EXECUTING;return true;
    }
    public synchronized void accepted(){if(state==State.EXECUTING)state=State.ACCEPTED;}
    public synchronized void failed(){state=state==State.EXECUTING?State.UNKNOWN:state==State.PREPARING?State.SAFE_FAILED:state;}
    public synchronized boolean mayRetry(){return state==State.NEW||state==State.SAFE_FAILED;}
    public static State afterRestart(State saved){
        return saved==State.EXECUTING?State.UNKNOWN:saved==State.PREPARING?State.SAFE_FAILED:saved;
    }
}
