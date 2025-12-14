document.addEventListener("DOMContentLoaded", loadAndRegisterSounds);

var canUseWebAudio = false;

function loadAndRegisterSounds() {
    "option explicit"

    // create AudioContext
    var audioContext;
    var masterGain;
    var audioUnlocked = false;

    var soundsCollection = [];
    var buttonsCollection = [];

    buttonsCollection.push(document.getElementById("button1"));
    buttonsCollection.push(document.getElementById("button2"));
    buttonsCollection.push(document.getElementById("button3"));
    buttonsCollection.push(document.getElementById("button4"));
    buttonsCollection.push(document.getElementById("button5"));
    buttonsCollection.push(document.getElementById("button6"));
    buttonsCollection.push(document.getElementById("button7"));

    try {
        if (typeof AudioContext !== 'undefined') {
            audioContext = new AudioContext();
            canUseWebAudio = true;
        } else if (typeof webkitAudioContext !== 'undefined') {
            audioContext = new webkitAudioContext();
            canUseWebAudio = true;
        }
        if (/iPad|iPhone|iPod/.test(navigator.platform)) {
            this._unlockiOSaudio();
        }
        else {
            audioUnlocked = true;
        }
    } catch (e) {
        console.error("Web Audio: " + e.message);
    }

    if (canUseWebAudio) {
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        soundsCollection.push(new Sound("./8bits_sounds/clap.wav", audioContext, masterGain, false, newSoundLoaded));
        soundsCollection.push(new Sound("./8bits_sounds/cowbell.wav", audioContext, masterGain, false, newSoundLoaded));
        soundsCollection.push(new Sound("./8bits_sounds/hihat1.wav", audioContext, masterGain, false, newSoundLoaded));
        soundsCollection.push(new Sound("./8bits_sounds/kick1.wav", audioContext, masterGain, false, newSoundLoaded));
        soundsCollection.push(new Sound("./8bits_sounds/snare1.wav", audioContext, masterGain, false, newSoundLoaded));
        soundsCollection.push(new Sound("./8bits_sounds/tom1.wav", audioContext, masterGain, false, newSoundLoaded));
        soundsCollection.push(new Sound("./8bits_sounds/kick3.wav", audioContext, masterGain, false, newSoundLoaded));
    }

    var soundsLoaded = 0;

    function newSoundLoaded() {
        soundsLoaded++;
        if (soundsLoaded == 7) {
            // Ready to rock & roll!
            for (var i = 0; i < 7; i++) {
                buttonsCollection[i].addEventListener("pointerdown", onPointerDown);
            }
        }
    }
    function onPointerDown(eventArgs) {
        var buttonClicked = eventArgs.currentTarget.id;
        var soundId = buttonClicked.substr(buttonClicked.length - 1) - 1;
        var soundToPlay = soundsCollection[soundId];
        soundToPlay.play();
    }
    function unlockiOSaudio() {
        var unlockaudio = function () {
            var buffer = audioContext.createBuffer(1, 1, 22050);
            var source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
            setTimeout(function () {
                if ((source.playbackState === source.PLAYING_STATE || source.playbackState === source.FINISHED_STATE)) {
                    audioUnlocked = true;
                    window.removeEventListener('touchend', unlockaudio, false);
                }
            }, 0);
        };
        window.addEventListener('touchend', unlockaudio, false);
    }
}

var Sound = (function () {
    function Sound(url, audioContext, masterGain, loop, callback) {
        this.url = url;
        this.audioContext = audioContext;
        this.masterGain = masterGain;
        this.loop = loop;
        this.callback = callback;
        this.gain = this.audioContext.createGain();
        this.gain.connect(this.masterGain);
        this.isReadyToPlay = false;
        this.loadSoundFile(url);
    }
    Sound.prototype.loadSoundFile = function () {
        if (canUseWebAudio) {
            var that = this;
            // make XMLHttpRequest (AJAX) on server
            var xhr = new XMLHttpRequest();
            xhr.open('GET', this.url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function (e) {
                // decoded binary response
                that.audioContext.decodeAudioData(this.response,
                function (decodedArrayBuffer) {
                    // get decoded buffer
                    that.buffer = decodedArrayBuffer;
                    that.isReadyToPlay = true;
                    if (that.callback) {
                        that.callback();
                    }
                }, function (e) {
                    console.log('Error decoding file', e);
                });
            };
            xhr.send();
        }
    };
    Sound.prototype.play = function () {
        if (canUseWebAudio && this.isReadyToPlay) {
            // make source
            this.source = this.audioContext.createBufferSource();
            // connect buffer to source
            this.source.buffer = this.buffer;
            this.source.loop = this.loop;
            // connect source to receiver
            this.source.connect(this.gain);
            // play
            this.source.start(0);
        }
    };
    Sound.prototype.stop = function () {
        if (canUseWebAudio) {
            this.source.stop(0);
        }
    };
    return Sound;
})();