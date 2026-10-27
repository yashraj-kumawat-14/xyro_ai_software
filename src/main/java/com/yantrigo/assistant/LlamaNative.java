package com.yantrigo.assistant;

import java.nio.file.Files;
import java.nio.file.Path;

public final class LlamaNative {

    private static boolean initialized = false;

    static {
        System.loadLibrary("xyro_llama");
    }

    private LlamaNative() {
    }

    private static native void nativeInitialize(
            String modelPath, int threads);

    private static native String nativeGenerate(
            String systemPrompt, String message, int maxTokens);

    private static native void nativeShutdown();

    public static synchronized void initialize(
            Path modelPath, int threads) {

        if (initialized) {
            return;
        }

        if (!Files.isRegularFile(modelPath)) {
            throw new IllegalArgumentException(
                    "Model file not found: " + modelPath);
        }

        nativeInitialize(modelPath.toAbsolutePath().toString(), threads);
        initialized = true;
    }

    public static synchronized String generate(
            String systemPrompt, String message, int maxTokens) {

        if (!initialized) {
            throw new IllegalStateException(
                    "The local language model is not initialized.");
        }

        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException(
                    "Message cannot be empty.");
        }

        if (maxTokens < 1 || maxTokens > 1024) {
            throw new IllegalArgumentException(
                    "maxTokens must be between 1 and 1024.");
        }

        return nativeGenerate(systemPrompt, message, maxTokens);
    }

    public static synchronized void shutdown() {
        if (initialized) {
            nativeShutdown();
            initialized = false;
        }
    }
}