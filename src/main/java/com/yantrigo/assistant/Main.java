
package com.yantrigo.assistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public class Main {

    private static final int PORT = 8080;

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String SYSTEM_PROMPT = """
            You are XYRO, a helpful humanoid robot assistant developed by Yantrigo.
            Speak naturally, clearly, and politely.
            Keep ordinary answers concise and useful.
            Do not claim to have performed physical actions unless a connected
            robot controller confirms that the action was actually executed.
            If you do not know something, say so honestly.
            """;

    private static final List<Map<String, String>> COMMANDS = List.of(
            Map.of("name", "wave", "description", "Wave hello"),
            Map.of("name", "forward", "description", "Move forward"),
            Map.of("name", "backward", "description", "Move backward"),
            Map.of("name", "turn_left", "description", "Turn left"),
            Map.of("name", "turn_right", "description", "Turn right"),
            Map.of("name", "stop", "description", "Stop movement")
    );

    public static void main(String[] args) throws IOException {

        String modelPath = System.getProperty(
                "xyro.model",
                "local_llm_models/qwen2.5-1.5b-instruct-q4_k_m.gguf");

        int threads = Math.max(1, Math.min(8,
                Runtime.getRuntime().availableProcessors()));

        System.out.println("Loading local Qwen model...");
        LlamaNative.initialize(Path.of(modelPath), threads);
        System.out.println("Local Qwen model loaded.");

        HttpServer server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", PORT), 0
        );

        // Serve the frontend.
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();

            if (path.startsWith("/api/")) {
                sendJson(exchange, 404,
                        Map.of("error", "API endpoint not found"));
                return;
            }

            if (!exchange.getRequestMethod().equals("GET")) {
                exchange.getResponseHeaders().set("Allow", "GET");
                sendText(exchange, 405, "Method not allowed");
                return;
            }

            // Only serve files from the public resource directory.
            String resourcePath;

            if (path.equals("/")) {
                resourcePath = "public/index.html";
            } else {
                String relativePath = path.substring(1);

                if (relativePath.contains("..")
                        || relativePath.contains("\\")
                        || relativePath.startsWith("/")) {
                    sendText(exchange, 400, "Invalid path");
                    return;
                }

                resourcePath = "public/" + relativePath;
            }

            try (InputStream input = Main.class.getClassLoader()
                    .getResourceAsStream(resourcePath)) {

                if (input == null) {
                    sendText(exchange, 404, "Resource not found");
                    return;
                }

                byte[] content = input.readAllBytes();

                exchange.getResponseHeaders().set(
                        "Content-Type", getContentType(resourcePath));

                exchange.sendResponseHeaders(200, content.length);
                exchange.getResponseBody().write(content);

            } catch (IOException e) {
                e.printStackTrace();
            } finally {
                exchange.close();
            }
        });

        // All API endpoints are handled here.
        server.createContext("/api/", Main::handleApi);

        server.start();

        System.out.println("XYRO AI server started.");
        System.out.println("Open http://localhost:" + PORT);
        System.out.println("API health: http://localhost:" + PORT
                + "/api/health");
        System.out.println("Press Ctrl+C to stop.");
    }

    private static void handleApi(HttpExchange exchange)
            throws IOException {

        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();

        try {
            switch (path) {

                case "/api/health" -> {
                    if (!method.equals("GET")) {
                        methodNotAllowed(exchange, "GET");
                        return;
                    }

                    sendJson(exchange, 200, Map.of(
                            "status", "ok",
                            "application", "XYRO AI Assistant",
                            "version", "1.0.0"
                    ));
                }

                case "/api/config" -> {
                    if (!method.equals("GET")) {
                        methodNotAllowed(exchange, "GET");
                        return;
                    }

                    sendJson(exchange, 200, Map.of(
                            "assistantName", "XYRO",
                            "provider", "llama.cpp",
                            "voiceEnabled", false,
                            "robotControlEnabled", false
                    ));
                }

                case "/api/commands" -> {
                    if (!method.equals("GET")) {
                        methodNotAllowed(exchange, "GET");
                        return;
                    }

                    sendJson(exchange, 200, Map.of(
                            "commands", COMMANDS
                    ));
                }

                case "/api/chat" -> {
                    if (!method.equals("POST")) {
                        methodNotAllowed(exchange, "POST");
                        return;
                    }

                    JsonNode body = readJsonBody(exchange);
                    if (body == null) {
                        return;
                    }

                    JsonNode messageNode = body.get("message");

                    if (messageNode == null
                            || !messageNode.isTextual()
                            || messageNode.asText().isBlank()) {
                        sendJson(exchange, 400,
                                Map.of("error",
                                        "A non-empty message is required"));
                        return;
                    }

                    String message = messageNode.asText().trim();

                    String reply = LlamaNative.generate(
                            SYSTEM_PROMPT, message, 256);

                    sendJson(exchange, 200, Map.of(
                            "reply", reply,
                            "provider", "llama.cpp"
                    ));
                }

                case "/api/robot/command" -> {
                    if (!method.equals("POST")) {
                        methodNotAllowed(exchange, "POST");
                        return;
                    }

                    JsonNode body = readJsonBody(exchange);
                    if (body == null) {
                        return;
                    }

                    JsonNode commandNode = body.get("command");

                    if (commandNode == null
                            || !commandNode.isTextual()) {
                        sendJson(exchange, 400,
                                Map.of("error",
                                        "A command string is required"));
                        return;
                    }

                    String command = commandNode.asText().trim();

                    boolean valid = COMMANDS.stream()
                            .anyMatch(c -> c.get("name").equals(command));

                    if (!valid) {
                        sendJson(exchange, 400, Map.of(
                                "error", "Unknown robot command",
                                "command", command
                        ));
                        return;
                    }

                    // Validation only. No physical robot action yet.
                    sendJson(exchange, 200, Map.of(
                            "accepted", true,
                            "command", command,
                            "executed", false,
                            "message", "Command validated; robot controller "
                                    + "is not connected yet"
                    ));
                }

                case "/api/robot/status" -> {
                    if (!method.equals("GET")) {
                        methodNotAllowed(exchange, "GET");
                        return;
                    }

                    sendJson(exchange, 200, Map.of(
                            "connected", false,
                            "transport", "bluetooth",
                            "message", "Robot connection not implemented"
                    ));
                }

                default -> sendJson(exchange, 404,
                        Map.of("error", "API endpoint not found"));
            }

        } catch (Exception e) {
            e.printStackTrace();

            sendJson(exchange, 500,
                    Map.of("error", "Internal server error"));
        } finally {
            exchange.close();
        }
    }

    private static JsonNode readJsonBody(HttpExchange exchange)
            throws IOException {

        String contentType = exchange.getRequestHeaders()
                .getFirst("Content-Type");

        if (contentType == null
                || !contentType.toLowerCase()
                .startsWith("application/json")) {
            sendJson(exchange, 415, Map.of(
                    "error", "Content-Type must be application/json"));
            return null;
        }

        byte[] bytes = exchange.getRequestBody().readNBytes(1_048_577);

        if (bytes.length > 1_048_576) {
            sendJson(exchange, 413,
                    Map.of("error", "Request body is too large"));
            return null;
        }

        try {
            JsonNode body = JSON.readTree(bytes);

            if (body == null || !body.isObject()) {
                sendJson(exchange, 400,
                        Map.of("error", "A JSON object is required"));
                return null;
            }

            return body;

        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            sendJson(exchange, 400,
                    Map.of("error", "Invalid JSON"));
            return null;
        }
    }

    private static void methodNotAllowed(
            HttpExchange exchange, String allowedMethod)
            throws IOException {

        exchange.getResponseHeaders().set("Allow", allowedMethod);
        sendJson(exchange, 405,
                Map.of("error", "Method not allowed"));
    }

    private static void sendJson(
            HttpExchange exchange, int status, Object data)
            throws IOException {

        byte[] bytes = JSON.writeValueAsBytes(data);

        exchange.getResponseHeaders().set(
                "Content-Type", "application/json; charset=UTF-8");

        exchange.getResponseHeaders().set(
                "Cache-Control", "no-store");

        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    private static void sendText(
            HttpExchange exchange, int status, String message)
            throws IOException {

        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);

        exchange.getResponseHeaders().set(
                "Content-Type", "text/plain; charset=UTF-8");

        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static String getContentType(String path) {

        if (path.endsWith(".html")) {
            return "text/html; charset=UTF-8";
        }

        if (path.endsWith(".css")) {
            return "text/css; charset=UTF-8";
        }

        if (path.endsWith(".js")) {
            return "application/javascript; charset=UTF-8";
        }

        if (path.endsWith(".json")) {
            return "application/json; charset=UTF-8";
        }

        if (path.endsWith(".svg")) {
            return "image/svg+xml";
        }

        if (path.endsWith(".png")) {
            return "image/png";
        }

        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
            return "image/jpeg";
        }

        if (path.endsWith(".ico")) {
            return "image/x-icon";
        }

        return "application/octet-stream";
    }
}
