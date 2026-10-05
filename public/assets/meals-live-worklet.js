class FamilyTodoMealPCM extends AudioWorkletProcessor{
 constructor(){super();this.bytes=new ArrayBuffer(4096);this.view=new DataView(this.bytes);this.at=0;this.peak=0;}
 process(inputs){const samples=inputs[0]?.[0];if(samples)for(const raw of samples){const value=Math.max(-1,Math.min(1,raw));this.peak=Math.max(this.peak,Math.abs(value));this.view.setInt16(this.at*2,Math.round(value<0?value*32768:value*32767),true);if(++this.at===2048){this.port.postMessage({bytes:this.bytes,peak:this.peak},[this.bytes]);this.bytes=new ArrayBuffer(4096);this.view=new DataView(this.bytes);this.at=0;this.peak=0;}}return true;}
}
registerProcessor('familytodo-meal-pcm',FamilyTodoMealPCM);
