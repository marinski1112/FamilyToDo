package jp.marinski.familytodo;

/** Main-thread state for one speech request, tied to the exact Cast session. */
final class SpeechRequestGate {
    private enum Phase { IDLE, SYNTHESIZING, PREPARING, LOADING, ACCEPTED }
    private Phase phase=Phase.IDLE;
    private String id;
    private Object session;
    private boolean closed;
    String begin(Object session) {
        if(closed||busy()||session==null)return null;
        this.session=session;id=java.util.UUID.randomUUID().toString();phase=Phase.SYNTHESIZING;return id;
    }
    boolean current(String candidate){return !closed&&candidate!=null&&candidate.equals(id);}
    boolean busy(){return phase==Phase.SYNTHESIZING||phase==Phase.PREPARING||phase==Phase.LOADING;}
    boolean prepare(String candidate){if(!current(candidate)||phase!=Phase.SYNTHESIZING)return false;phase=Phase.PREPARING;return true;}
    boolean load(String candidate,Object currentSession){if(!current(candidate)||phase!=Phase.PREPARING||session!=currentSession)return false;phase=Phase.LOADING;return true;}
    boolean accepted(String candidate){if(!current(candidate)||phase!=Phase.LOADING)return false;phase=Phase.ACCEPTED;return true;}
    void cancel(){id=null;session=null;phase=Phase.IDLE;}
    void close(){cancel();closed=true;}
}
