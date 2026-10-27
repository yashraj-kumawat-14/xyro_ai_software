
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const userMessage = document.getElementById("user-message");
    const llmResponse = document.getElementById("llm-response");
    const sendButton = document.getElementById("send-btn");

    const orb = document.getElementById("voice-orb");
    const orbStatus = document.getElementById("orb-status");

    const responseStatus = document.getElementById("response-status");
    const serverStatus = document.getElementById("server-status");
    const statusIndicator = document.getElementById("status-indicator");
    const voiceButton = document.getElementById("voice-btn");

    let isSending = false;
    let isListening = false;
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let microphoneStream = null;
    let recognition = null;

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    // Read the selected speech engine from Settings.
    function getSpeechEngine() {
        return localStorage.getItem("xyroSpeechEngine") || "browser";
    }

    function setOrbState(state, message) {
        if (!orb || !orbStatus) {
            return;
        }

        orb.classList.remove("listening", "thinking");

        if (state === "thinking") {
            orb.classList.add("thinking");
        } else if (state === "listening") {
            orb.classList.add("listening");
        }

        orbStatus.textContent = message;
    }

    async function checkServer() {
        try {
            const response = await fetch("/api/health");

            if (!response.ok) {
                throw new Error("Server returned HTTP " + response.status);
            }

            const data = await response.json();

            if (serverStatus) {
                serverStatus.textContent =
                    "Server status: " + (data.status || "Connected");
            }

            if (statusIndicator) {
                statusIndicator.classList.remove("offline");
            }
        } catch (error) {
            if (serverStatus) {
                serverStatus.textContent = "Server unavailable";
            }

            if (statusIndicator) {
                statusIndicator.classList.add("offline");
            }

            console.error("Server health check failed:", error);
        }
    }

    async function sendMessage() {
        const message = userMessage.value.trim();

        if (!message || isSending || isListening || isRecording) {
            return;
        }

        isSending = true;
        sendButton.disabled = true;
        sendButton.textContent = "Thinking...";

        llmResponse.value = "";
        responseStatus.textContent = "XYRO is generating a response...";
        setOrbState("thinking", "XYRO IS THINKING");

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ message })
            });

            const responseText = await response.text();
            let data;

            try {
                data = JSON.parse(responseText);
            } catch {
                throw new Error(
                    "The server returned an invalid response. " +
                    "Check the Java server terminal."
                );
            }

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    data.message ||
                    "Request failed with HTTP " + response.status
                );
            }

            if (typeof data.reply !== "string") {
                throw new Error("The server response did not contain a reply.");
            }

            llmResponse.value = data.reply;
            responseStatus.textContent = "Response received";
            setOrbState("ready", "XYRO IS READY");

        } catch (error) {
            console.error("Chat request failed:", error);

            llmResponse.value =
                "Unable to get a response from XYRO.\n\n" + error.message;

            responseStatus.textContent = "Request failed";
            setOrbState("ready", "CONNECTION ERROR");

        } finally {
            isSending = false;
            sendButton.disabled = false;
            sendButton.innerHTML = 'Send <span aria-hidden="true">➤</span>';
            userMessage.focus();
        }
    }

    // Send button and keyboard input.
    sendButton.addEventListener("click", sendMessage);

    userMessage.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    // Navigation.
    document.getElementById("settings-btn").addEventListener("click", () => {
        window.location.href = "/settings.html";
    });

    document.getElementById("manual-btn").addEventListener("click", () => {
        window.location.href = "/user_manual.html";
    });

    document.getElementById("help-btn").addEventListener("click", () => {
        window.location.href = "/help.html";
    });

    document.getElementById("recognize-btn").addEventListener("click", () => {
        console.log("Face recognition will be implemented later.");
    });

    document.getElementById("register-btn").addEventListener("click", () => {
        console.log("Face registration will be implemented later.");
    });

    // Release microphone resources.
    function releaseMicrophone() {
        if (microphoneStream) {
            microphoneStream.getTracks().forEach((track) => track.stop());
            microphoneStream = null;
        }
    }

    // LOCAL PARAKEET SPEECH RECOGNITION
    async function startParakeetRecording() {
        if (isSending || isListening || isRecording) {
            return;
        }

        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia ||
            !window.MediaRecorder) {
            responseStatus.textContent =
                "Audio recording is not supported by this browser.";
            return;
        }

        try {
            microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            audioChunks = [];

            const options = {};

            if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
                options.mimeType = "audio/webm;codecs=opus";
            } else if (MediaRecorder.isTypeSupported("audio/webm")) {
                options.mimeType = "audio/webm";
            }

            mediaRecorder = new MediaRecorder(microphoneStream, options);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onerror = (event) => {
                console.error("Audio recording error:", event.error);
                responseStatus.textContent = "Audio recording failed.";
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, {
                    type: mediaRecorder.mimeType || "audio/webm"
                });

                releaseMicrophone();
                isRecording = false;
                updateVoiceButton();

                if (audioBlob.size === 0) {
                    responseStatus.textContent = "No audio was recorded.";
                    setOrbState("ready", "XYRO IS READY");
                    return;
                }

                await transcribeWithParakeet(audioBlob);
            };

            mediaRecorder.start();

            isRecording = true;
            updateVoiceButton();

            setOrbState("listening", "LISTENING...");
            responseStatus.textContent =
                "Recording locally with Parakeet. Click the microphone to stop.";

        } catch (error) {
            console.error("Could not start microphone recording:", error);

            releaseMicrophone();
            isRecording = false;
            updateVoiceButton();

            responseStatus.textContent =
                error.name === "NotAllowedError"
                    ? "Microphone permission denied. Allow microphone access."
                    : "Could not access microphone: " + error.message;

            setOrbState("ready", "MICROPHONE ERROR");
        }
    }

    function stopParakeetRecording() {
        if (mediaRecorder && isRecording &&
            mediaRecorder.state !== "inactive") {
            responseStatus.textContent = "Preparing audio for transcription...";
            mediaRecorder.stop();
        }
    }

    async function transcribeWithParakeet(audioBlob) {
        voiceButton.disabled = true;
        responseStatus.textContent = "Transcribing with local Parakeet...";
        setOrbState("thinking", "TRANSCRIBING SPEECH");

        try {
            const response = await fetch("/api/transcribe", {
                method: "POST",
                headers: {
                    "Content-Type": audioBlob.type || "audio/webm"
                },
                body: audioBlob
            });

            const responseText = await response.text();
            let data;

            try {
                data = JSON.parse(responseText);
            } catch {
                throw new Error(
                    "The transcription server returned an invalid response."
                );
            }

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Transcription failed with HTTP " + response.status
                );
            }

            if (typeof data.transcript !== "string" ||
                !data.transcript.trim()) {
                throw new Error("Parakeet did not detect any speech.");
            }

            userMessage.value = data.transcript.trim();
            userMessage.dispatchEvent(new Event("input", { bubbles: true }));

            responseStatus.textContent =
                "Speech recognized. Sending to XYRO...";

            // Automatically send the recognized speech to Qwen.
            await sendMessage();

        } catch (error) {
            console.error("Parakeet transcription failed:", error);

            responseStatus.textContent =
                "Transcription failed: " + error.message;

            setOrbState("ready", "TRANSCRIPTION ERROR");

        } finally {
            voiceButton.disabled = false;
            updateVoiceButton();
        }
    }

    // BROWSER SPEECH RECOGNITION
    function setupBrowserRecognition() {
        if (!SpeechRecognition) {
            responseStatus.textContent =
                "Browser speech recognition is not supported. " +
                "Choose Local Parakeet in Settings.";
            return false;
        }

        recognition = new SpeechRecognition();

        recognition.lang = "en-IN";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isListening = true;
            updateVoiceButton();

            setOrbState("listening", "LISTENING...");
            responseStatus.textContent = "Speak now...";
        };

        recognition.onresult = (event) => {
            let finalTranscript = "";
            let interimTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (interimTranscript) {
                responseStatus.textContent =
                    "Recognizing: " + interimTranscript;
            }

            if (finalTranscript.trim()) {
                userMessage.value = finalTranscript.trim();
                userMessage.dispatchEvent(
                    new Event("input", { bubbles: true })
                );

                responseStatus.textContent = "Speech recognized";
            }
        };

        recognition.onerror = (event) => {
            console.error("Browser speech recognition error:", event.error);

            const messages = {
                "not-allowed":
                    "Microphone permission denied. Allow microphone access.",
                "no-speech":
                    "No speech detected. Try again.",
                "audio-capture":
                    "No microphone found. Check your microphone connection.",
                "network":
                    "Browser recognition network error. Check your connection.",
                "service-not-allowed":
                    "The browser speech recognition service is unavailable."
            };

            responseStatus.textContent =
                messages[event.error] ||
                "Speech recognition failed: " + event.error;
        };

        recognition.onend = () => {
            isListening = false;
            updateVoiceButton();

            if (!isSending) {
                setOrbState(
                    "ready",
                    userMessage.value.trim()
                        ? "VOICE INPUT READY"
                        : "XYRO IS READY"
                );
            }

            // Keep the existing automatic-send behavior.
            if (userMessage.value.trim() && !isSending) {
                sendMessage();
            }
        };

        return true;
    }

    // Update microphone button appearance.
    function updateVoiceButton() {
        if (!voiceButton) {
            return;
        }

        if (isRecording || isListening) {
            voiceButton.classList.add("listening");
            voiceButton.textContent = "■";
            voiceButton.title = "Stop listening";
            voiceButton.setAttribute("aria-label", "Stop voice input");
        } else {
            voiceButton.classList.remove("listening");
            voiceButton.textContent = "🎙";
            voiceButton.title = "Speak to XYRO";
            voiceButton.setAttribute("aria-label", "Start voice input");
        }
    }

    // Choose the speech engine configured in Settings.
    if (voiceButton) {
        voiceButton.addEventListener("click", async () => {
            if (isSending) {
                return;
            }

            const engine = getSpeechEngine();

            if (engine === "parakeet") {
                if (isRecording) {
                    stopParakeetRecording();
                } else {
                    await startParakeetRecording();
                }

                return;
            }

            if (!recognition && !setupBrowserRecognition()) {
                return;
            }

            if (isListening) {
                recognition.stop();
                return;
            }

            try {
                recognition.start();
            } catch (error) {
                console.error("Could not start browser recognition:", error);
                responseStatus.textContent =
                    "Could not start speech recognition. Try again.";
            }
        });
    }

    checkServer();
    userMessage.focus();
    updateVoiceButton();
});
