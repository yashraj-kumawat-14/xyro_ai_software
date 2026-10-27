
package com.yantrigo.assistant;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

public class ParakeetTranscriber {

    private static final Path MODEL_PATH = Paths.get(
            System.getProperty(
                    "xyro.parakeet.model",
                    "parakeet_stt_models/parakeet-tdt_ctc-110m-Q8_0.gguf"
            )
    ).toAbsolutePath().normalize();

    private static final Path TRANSCRIBE_CLI = Paths.get(
            System.getProperty(
                    "xyro.transcribe.cli",
                    System.getProperty("user.home")
                            + "/Desktop/projects/transcribe.cpp/build/bin/transcribe-cli"
            )
    ).toAbsolutePath().normalize();

    private static final String FFMPEG =
            System.getProperty("xyro.ffmpeg", "ffmpeg");

    private static final long FFMPEG_TIMEOUT_SECONDS = 60;
    private static final long TRANSCRIPTION_TIMEOUT_SECONDS = 120;

    public ParakeetTranscriber() {
        validateConfiguration();
    }

    private void validateConfiguration() {
        if (!Files.isRegularFile(MODEL_PATH)) {
            throw new IllegalStateException(
                    "Parakeet model not found: " + MODEL_PATH
            );
        }

        if (!Files.isRegularFile(TRANSCRIBE_CLI)
                || !Files.isExecutable(TRANSCRIBE_CLI)) {
            throw new IllegalStateException(
                    "transcribe-cli missing or not executable: "
                            + TRANSCRIBE_CLI
            );
        }
    }

    public String transcribe(byte[] audioBytes)
            throws IOException, InterruptedException {

        if (audioBytes == null || audioBytes.length == 0) {
            throw new IllegalArgumentException("No audio data received.");
        }

        Path temporaryDirectory = Files.createTempDirectory("xyro-stt-");

        Path inputAudio = temporaryDirectory.resolve("recording.webm");
        Path convertedWav = temporaryDirectory.resolve("recording.wav");
        Path transcriptFile = temporaryDirectory.resolve("transcript.txt");
        Path ffmpegLog = temporaryDirectory.resolve("ffmpeg.log");
        Path transcribeLog = temporaryDirectory.resolve("transcribe.log");

        try {
            Files.write(inputAudio, audioBytes);

            convertToWav(inputAudio, convertedWav, ffmpegLog);
            runParakeet(convertedWav, transcriptFile, transcribeLog);

            if (!Files.isRegularFile(transcriptFile)) {
                throw new IOException(
                        "Parakeet did not produce a transcript file."
                );
            }

            return Files.readString(
                    transcriptFile, StandardCharsets.UTF_8
            ).trim();

        } finally {
            deleteTemporaryFiles(temporaryDirectory);
        }
    }

    private void convertToWav(
            Path inputAudio,
            Path outputWav,
            Path logFile
    ) throws IOException, InterruptedException {

        Process process = new ProcessBuilder(
                FFMPEG,
                "-y",
                "-hide_banner",
                "-loglevel", "error",
                "-i", inputAudio.toString(),
                "-ar", "16000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                outputWav.toString()
        )
                .redirectErrorStream(true)
                .redirectOutput(logFile.toFile())
                .start();

        boolean finished = process.waitFor(
                FFMPEG_TIMEOUT_SECONDS, TimeUnit.SECONDS
        );

        if (!finished) {
            process.destroyForcibly();
            throw new IOException("FFmpeg audio conversion timed out.");
        }

        if (process.exitValue() != 0
                || !Files.isRegularFile(outputWav)
                || Files.size(outputWav) == 0) {

            String details = readLog(logFile);

            throw new IOException(
                    "FFmpeg could not convert the audio."
                            + (details.isBlank() ? "" : " " + details)
            );
        }
    }

    private void runParakeet(
            Path wavFile,
            Path transcriptFile,
            Path logFile
    ) throws IOException, InterruptedException {

        Process process = new ProcessBuilder(
                TRANSCRIBE_CLI.toString(),
                "-q",
                "-m", MODEL_PATH.toString(),
                "-o", transcriptFile.toString(),
                wavFile.toString()
        )
                .redirectErrorStream(true)
                .redirectOutput(logFile.toFile())
                .start();

        boolean finished = process.waitFor(
                TRANSCRIPTION_TIMEOUT_SECONDS, TimeUnit.SECONDS
        );

        if (!finished) {
            process.destroyForcibly();
            throw new IOException("Parakeet transcription timed out.");
        }

        if (process.exitValue() != 0) {
            String details = readLog(logFile);

            throw new IOException(
                    "Parakeet transcription failed."
                            + (details.isBlank() ? "" : " " + details)
            );
        }
    }

    private String readLog(Path logFile) throws IOException {
        if (!Files.isRegularFile(logFile)) {
            return "";
        }

        return Files.readString(
                logFile, StandardCharsets.UTF_8
        ).trim();
    }

    private void deleteTemporaryFiles(Path directory) {
        try (var paths = Files.walk(directory)) {
            paths.sorted((a, b) -> b.compareTo(a))
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            System.err.println(
                                    "Could not delete temporary file: " + path
                            );
                        }
                    });
        } catch (IOException e) {
            System.err.println(
                    "Could not clean temporary directory: " + directory
            );
        }
    }
}
