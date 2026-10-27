
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const settingsForm = document.getElementById("settings-form");

    // Language-model engine controls
    const serverEngine = document.getElementById("server-engine");
    const localEngine = document.getElementById("local-engine");

    const serverFields = document.getElementById("server-fields");
    const localFields = document.getElementById("local-fields");

    const serverUrl = document.getElementById("server-url");
    const modelName = document.getElementById("model-name");
    const modelPath = document.getElementById("model-path");
    const modelFile = document.getElementById("model-file");

    // Speech-recognition engine controls
    const browserSpeechEngine = document.getElementById(
        "speech-browser-engine"
    );

    const parakeetSpeechEngine = document.getElementById(
        "speech-parakeet-engine"
    );

    const speechEngineStatus = document.getElementById(
        "speech-engine-status"
    );

    // Response-generation controls
    const systemPrompt = document.getElementById("system-prompt");
    const temperature = document.getElementById("temperature");
    const temperatureValue = document.getElementById("temperature-value");

    // Buttons and notification
    const browseButton = document.getElementById("browse-model-btn");
    const resetButton = document.getElementById("reset-btn");
    const passwordButton = document.getElementById("password-btn");
    const notice = document.getElementById("settings-notice");

    const SPEECH_ENGINE_STORAGE_KEY = "xyroSpeechEngine";

    const defaults = {
        engineType: "server",
        serverUrl: "http://10.0.2.2:8080",
        modelName: "qwen2.5:1.5b",
        systemPrompt:
            "You are XYRO, a helpful AI assistant for a humanoid robot developed by Yantrigo. Give clear, concise, and useful responses.",
        temperature: "0.7",
        localModelPath: "",
        speechEngine: "browser"
    };

    function showNotice(message) {
        notice.textContent = message;
        notice.hidden = false;
    }

    function hideNotice() {
        notice.textContent = "";
        notice.hidden = true;
    }

    function updateSelectedCards() {
        document.querySelectorAll(".engine-option").forEach((option) => {
            const radio = option.querySelector('input[type="radio"]');

            if (radio) {
                option.classList.toggle("selected", radio.checked);
            }
        });
    }

    function updateEngineFields() {
        const isServerMode = serverEngine.checked;

        serverFields.hidden = !isServerMode;
        localFields.hidden = isServerMode;

        updateSelectedCards();
        hideNotice();
    }

    function getSelectedSpeechEngine() {
        return parakeetSpeechEngine.checked ? "parakeet" : "browser";
    }

    function updateSpeechEngine() {
        const selectedEngine = getSelectedSpeechEngine();

        updateSelectedCards();

        if (selectedEngine === "parakeet") {
            speechEngineStatus.textContent =
                "Selected: Local Parakeet — server transcription integration pending.";
        } else {
            speechEngineStatus.textContent =
                "Selected: Browser Speech Recognition.";
        }

        hideNotice();
    }

    function loadSpeechEngine() {
        let savedEngine = defaults.speechEngine;

        try {
            const storedValue = localStorage.getItem(
                SPEECH_ENGINE_STORAGE_KEY
            );

            if (storedValue === "browser" || storedValue === "parakeet") {
                savedEngine = storedValue;
            }
        } catch (error) {
            console.warn("Could not load speech engine setting:", error);
        }

        browserSpeechEngine.checked = savedEngine === "browser";
        parakeetSpeechEngine.checked = savedEngine === "parakeet";

        updateSpeechEngine();
    }

    function saveSpeechEngine() {
        const selectedEngine = getSelectedSpeechEngine();

        try {
            localStorage.setItem(
                SPEECH_ENGINE_STORAGE_KEY,
                selectedEngine
            );

            return true;
        } catch (error) {
            console.error("Could not save speech engine setting:", error);
            return false;
        }
    }

    function updateTemperature() {
        temperatureValue.textContent = Number(temperature.value).toFixed(2);
    }

    function resetForm() {
        serverEngine.checked = defaults.engineType === "server";
        localEngine.checked = defaults.engineType === "local";

        serverUrl.value = defaults.serverUrl;
        modelName.value = defaults.modelName;
        modelPath.value = defaults.localModelPath;
        modelFile.value = "";

        systemPrompt.value = defaults.systemPrompt;
        temperature.value = defaults.temperature;

        browserSpeechEngine.checked = defaults.speechEngine === "browser";
        parakeetSpeechEngine.checked = defaults.speechEngine === "parakeet";

        updateEngineFields();
        updateSpeechEngine();
        updateTemperature();

        showNotice(
            "The displayed fields have been reset to their defaults. " +
            "Press Save Settings to save the speech-recognition choice. " +
            "Other AI settings are not connected to the backend yet."
        );
    }

    // Language-model selection
    serverEngine.addEventListener("change", updateEngineFields);
    localEngine.addEventListener("change", updateEngineFields);

    // Speech-recognition selection
    browserSpeechEngine.addEventListener("change", updateSpeechEngine);
    parakeetSpeechEngine.addEventListener("change", updateSpeechEngine);

    // Temperature display
    temperature.addEventListener("input", updateTemperature);

    // Model file selection placeholder
    browseButton.addEventListener("click", () => {
        modelFile.click();
    });

    modelFile.addEventListener("change", () => {
        const file = modelFile.files && modelFile.files[0];

        if (!file) {
            return;
        }

        // Browsers do not expose the actual local filesystem path.
        modelPath.value = file.name;

        showNotice(
            "Selected file: " + file.name +
            ". Model loading and file importing are not implemented yet."
        );
    });

    // Reset displayed values
    resetButton.addEventListener("click", () => {
        resetForm();
    });

    // Password protection placeholder
    passwordButton.addEventListener("click", () => {
        showNotice(
            "Password protection is a visual placeholder. " +
            "Password creation, verification, and storage have not " +
            "been implemented in the web application yet."
        );
    });

    // Save settings
    settingsForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const speechSaved = saveSpeechEngine();
        const selectedEngine = getSelectedSpeechEngine();

        if (!speechSaved) {
            showNotice(
                "Could not save the speech-recognition choice in this browser. " +
                "Check browser storage settings and try again."
            );
            return;
        }

        const engineName = selectedEngine === "parakeet"
            ? "Local Parakeet"
            : "Browser Speech Recognition";

        showNotice(
            "Speech-recognition preference saved: " + engineName + ". " +
            "This preference is stored in this browser only. " +
            "Parakeet recording and transcription will be connected in the next step. " +
            "The language-model settings are not saved to the Java backend."
        );
    });

    // Initialize the page
    updateEngineFields();
    updateTemperature();
    loadSpeechEngine();
});
