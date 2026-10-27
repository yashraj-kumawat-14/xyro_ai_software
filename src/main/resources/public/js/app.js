
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

    let isSending = false;

    // Check whether the Java server is available.
    async function checkServer() {
        try {
            const response = await fetch("/api/health");

            if (!response.ok) {
                throw new Error("Server returned HTTP " + response.status);
            }

            const data = await response.json();

            serverStatus.textContent =
                "Server status: " + (data.status || "Connected");

            statusIndicator.classList.remove("offline");
        } catch (error) {
            serverStatus.textContent = "Server unavailable";
            statusIndicator.classList.add("offline");

            console.error("Server health check failed:", error);
        }
    }

    // Update the orb's appearance and status text.
    function setOrbState(state, message) {
        orb.classList.remove("listening", "thinking");

        if (state === "thinking") {
            orb.classList.add("thinking");
        } else if (state === "listening") {
            orb.classList.add("listening");
        }

        orbStatus.textContent = message;
    }

    // Send the user's message to the local Java + llama.cpp backend.
    async function sendMessage() {
        const message = userMessage.value.trim();

        if (!message || isSending) {
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
                body: JSON.stringify({
                    message: message
                })
            });

            // Read the response as text first so unexpected server errors
            // can be reported without causing a JSON parsing error.
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

            llmResponse.value = "Unable to get a response from XYRO.\n\n" +
                error.message;

            responseStatus.textContent = "Request failed";
            setOrbState("ready", "CONNECTION ERROR");

        } finally {
            isSending = false;
            sendButton.disabled = false;
            sendButton.innerHTML = 'Send <span aria-hidden="true">➤</span>';
            userMessage.focus();
        }
    }

    // Send button.
    sendButton.addEventListener("click", sendMessage);

    // Enter sends; Shift + Enter inserts a new line.
    userMessage.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    // Keep navigation buttons inactive until their features are implemented.
    document.getElementById("settings-btn").addEventListener("click", () => {
        console.log("Settings will be implemented later.");
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

    // Initial setup.
    checkServer();
    userMessage.focus();


    // Browser-based speech recognition
    const voiceButton = document.getElementById("voice-btn");

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    let recognition = null;
    let isListening = false;

    if (!voiceButton) {
        console.warn("Voice button #voice-btn was not found.");
    } else if (!SpeechRecognition) {
        voiceButton.disabled = true;
        voiceButton.title = "Speech recognition is not supported by this browser";
        voiceButton.setAttribute("aria-label", "Speech recognition unavailable");

        orbStatus.textContent = "VOICE INPUT NOT SUPPORTED";
    } else {
        recognition = new SpeechRecognition();

        recognition.lang = "en-IN";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        voiceButton.addEventListener("click", () => {
            if (isSending) {
                return;
            }

            if (isListening) {
                recognition.stop();
                return;
            }

            try {
                recognition.start();
            } catch (error) {
                console.error("Could not start voice recognition:", error);
                orbStatus.textContent = "VOICE START FAILED";
            }
        });

        recognition.onstart = () => {
            isListening = true;

            voiceButton.classList.add("listening");
            voiceButton.textContent = "■";
            voiceButton.title = "Stop listening";
            voiceButton.setAttribute("aria-label", "Stop voice input");

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
            console.error("Speech recognition error:", event.error);

            const messages = {
                "not-allowed":
                    "Microphone permission denied. Allow microphone access in your browser.",
                "no-speech":
                    "No speech detected. Try speaking again.",
                "audio-capture":
                    "No microphone was found. Check your microphone connection.",
                "network":
                    "Speech recognition network error. Check your internet connection.",
                "service-not-allowed":
                    "The speech recognition service is unavailable or blocked."
            };

            responseStatus.textContent =
                messages[event.error] ||
                "Speech recognition failed: " + event.error;
        };

        recognition.onend = () => {
            isListening = false;

            voiceButton.classList.remove("listening");
            voiceButton.textContent = "🎙";
            voiceButton.title = "Speak to XYRO";
            voiceButton.setAttribute("aria-label", "Start voice input");

            if (userMessage.value.trim() && !isSending) {
                setOrbState("ready", "VOICE INPUT READY");
            } else if (!isSending) {
                setOrbState("ready", "XYRO IS READY");
            }

            // Automatically send a completed transcription to the LLM.
            // Remove this block if you prefer to review/edit the text first.
            if (userMessage.value.trim() && !isSending) {
                sendMessage();
            }
        };
    }

});
