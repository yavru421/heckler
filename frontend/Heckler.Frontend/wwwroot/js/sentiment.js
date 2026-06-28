window.audioSentiment = {
    audioContext: null,
    analyser: null,
    microphone: null,
    isRecording: false,
    startListening: async function () {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.microphone.connect(this.analyser);
            this.isRecording = true;
            return true;
        } catch (e) {
            console.error("Microphone access denied or error:", e);
            return false;
        }
    },
    measureLaughter: async function (durationMs) {
        if (!this.isRecording || !this.analyser) return false;
        
        return new Promise((resolve) => {
            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            let totalVolume = 0;
            let checks = 0;
            
            const interval = setInterval(() => {
                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for(let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                totalVolume += average;
                checks++;
            }, 100);
            
            setTimeout(() => {
                clearInterval(interval);
                const avgVolume = totalVolume / checks;
                // Volume threshold for laughter (can be tweaked, > 30 is a reasonable spike)
                console.log("Avg volume:", avgVolume);
                resolve(avgVolume > 20); // Return true if volume exceeded threshold
            }, durationMs);
        });
    }
};
