#include <jni.h>
#include "llama.h"

#include <algorithm>
#include <cstdint>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

llama_model *g_model = nullptr;
llama_context *g_context = nullptr;
const llama_vocab *g_vocab = nullptr;

std::mutex g_mutex;
bool g_backend_initialized = false;

void throwJavaException(
        JNIEnv *env,
        const char *className,
        const std::string &message) {

    jclass exceptionClass = env->FindClass(className);

    if (exceptionClass != nullptr) {
        env->ThrowNew(exceptionClass, message.c_str());
    }
}

std::string fromJavaString(JNIEnv *env, jstring value) {
    if (value == nullptr) {
        return "";
    }

    const char *chars = env->GetStringUTFChars(value, nullptr);

    if (chars == nullptr) {
        throw std::runtime_error("Could not read Java string.");
    }

    std::string result(chars);
    env->ReleaseStringUTFChars(value, chars);

    return result;
}

std::string createPrompt(
        const std::string &systemPrompt,
        const std::string &message) {

    const char *templateText =
            llama_model_chat_template(g_model, nullptr);

    if (templateText != nullptr) {
        llama_chat_message messages[2] = {
            {"system", systemPrompt.c_str()},
            {"user", message.c_str()}
        };

        std::vector<char> buffer(8192);

        int32_t length = llama_chat_apply_template(
                templateText,
                messages,
                2,
                true,
                buffer.data(),
                static_cast<int32_t>(buffer.size()));

        if (length >= 0) {
            if (static_cast<size_t>(length) > buffer.size()) {
                buffer.resize(static_cast<size_t>(length) + 1);

                length = llama_chat_apply_template(
                        templateText,
                        messages,
                        2,
                        true,
                        buffer.data(),
                        static_cast<int32_t>(buffer.size()));
            }

            if (length >= 0
                    && static_cast<size_t>(length) <= buffer.size()) {
                return std::string(
                        buffer.data(), static_cast<size_t>(length));
            }
        }
    }

    // Fallback format for Qwen2.5 Instruct models.
    return "<|im_start|>system\n" + systemPrompt
            + "<|im_end|>\n<|im_start|>user\n" + message
            + "<|im_end|>\n<|im_start|>assistant\n";
}

std::vector<llama_token> tokenizePrompt(
        const std::string &prompt) {

    // A character-based initial capacity with room for special tokens.
    std::vector<llama_token> tokens(prompt.size() + 32);

    int32_t count = llama_tokenize(
            g_vocab,
            prompt.c_str(),
            static_cast<int32_t>(prompt.size()),
            tokens.data(),
            static_cast<int32_t>(tokens.size()),
            false,
            true);

    if (count < 0) {
        tokens.resize(static_cast<size_t>(-count));

        count = llama_tokenize(
                g_vocab,
                prompt.c_str(),
                static_cast<int32_t>(prompt.size()),
                tokens.data(),
                static_cast<int32_t>(tokens.size()),
                false,
                true);
    }

    if (count <= 0) {
        throw std::runtime_error("Could not tokenize the prompt.");
    }

    tokens.resize(static_cast<size_t>(count));
    return tokens;
}

std::string tokenToText(llama_token token) {
    std::vector<char> buffer(256);

    int32_t length = llama_token_to_piece(
            g_vocab, token, buffer.data(),
            static_cast<int32_t>(buffer.size()), 0, true);

    if (length < 0) {
        buffer.resize(static_cast<size_t>(-length));

        length = llama_token_to_piece(
                g_vocab, token, buffer.data(),
                static_cast<int32_t>(buffer.size()), 0, true);
    }

    if (length <= 0) {
        return "";
    }

    return std::string(buffer.data(), static_cast<size_t>(length));
}

void releaseModel() {
    if (g_context != nullptr) {
        llama_free(g_context);
        g_context = nullptr;
    }

    g_vocab = nullptr;

    if (g_model != nullptr) {
        llama_model_free(g_model);
        g_model = nullptr;
    }

    if (g_backend_initialized) {
        llama_backend_free();
        g_backend_initialized = false;
    }
}

} // namespace

extern "C" {

JNIEXPORT void JNICALL
Java_com_yantrigo_assistant_LlamaNative_nativeInitialize(
        JNIEnv *env,
        jclass,
        jstring modelPath,
        jint threads) {

    std::lock_guard<std::mutex> lock(g_mutex);

    if (g_model != nullptr && g_context != nullptr) {
        return;
    }

    try {
        const std::string path = fromJavaString(env, modelPath);

        if (path.empty()) {
            throw std::runtime_error("The model path is empty.");
        }

        llama_backend_init();
        g_backend_initialized = true;

        llama_model_params modelParams =
                llama_model_default_params();

        g_model = llama_model_load_from_file(
                path.c_str(), modelParams);

        if (g_model == nullptr) {
            throw std::runtime_error(
                    "llama.cpp could not load the GGUF model: " + path);
        }

        g_vocab = llama_model_get_vocab(g_model);

        if (g_vocab == nullptr) {
            throw std::runtime_error(
                    "Could not get the model vocabulary.");
        }

        llama_context_params contextParams =
                llama_context_default_params();

        contextParams.n_ctx = 4096;
        contextParams.n_batch = 2048;
        contextParams.n_threads =
                std::max(1, static_cast<int>(threads));
        contextParams.n_threads_batch =
                std::max(1, static_cast<int>(threads));

        g_context = llama_init_from_model(
                g_model, contextParams);

        if (g_context == nullptr) {
            throw std::runtime_error(
                    "Could not create the llama.cpp context.");
        }

    } catch (const std::exception &e) {
        releaseModel();
        throwJavaException(
                env, "java/lang/IllegalStateException", e.what());
    } catch (...) {
        releaseModel();
        throwJavaException(
                env, "java/lang/IllegalStateException",
                "Unknown error while initializing llama.cpp.");
    }
}

JNIEXPORT jstring JNICALL
Java_com_yantrigo_assistant_LlamaNative_nativeGenerate(
        JNIEnv *env,
        jclass,
        jstring systemPromptValue,
        jstring messageValue,
        jint maxTokens) {

    std::lock_guard<std::mutex> lock(g_mutex);

    try {
        if (g_model == nullptr || g_context == nullptr
                || g_vocab == nullptr) {
            throw std::runtime_error(
                    "The language model has not been initialized.");
        }

        const std::string systemPrompt =
                fromJavaString(env, systemPromptValue);
        const std::string message =
                fromJavaString(env, messageValue);

        if (message.empty()) {
            throw std::runtime_error("The message is empty.");
        }

        const std::string prompt =
                createPrompt(systemPrompt, message);

        std::vector<llama_token> tokens = tokenizePrompt(prompt);

        if (tokens.size() >= llama_n_ctx(g_context)) {
            throw std::runtime_error(
                    "Prompt is too long for the configured context.");
        }

        // Start each request with an empty inference context.
        llama_memory_clear(llama_get_memory(g_context), true);

        llama_batch promptBatch = llama_batch_get_one(
                tokens.data(), static_cast<int32_t>(tokens.size()));

        const int32_t decodeResult =
                llama_decode(g_context, promptBatch);

        if (decodeResult != 0) {
            throw std::runtime_error(
                    "Failed to evaluate the prompt with llama_decode().");
        }

        llama_sampler_chain_params samplerParams =
                llama_sampler_chain_default_params();

        llama_sampler *sampler =
                llama_sampler_chain_init(samplerParams);

        if (sampler == nullptr) {
            throw std::runtime_error(
                    "Could not initialize the sampler.");
        }

        llama_sampler_chain_add(
                sampler, llama_sampler_init_top_k(40));
        llama_sampler_chain_add(
                sampler, llama_sampler_init_top_p(0.9f, 1));
        llama_sampler_chain_add(
                sampler, llama_sampler_init_temp(0.7f));
        llama_sampler_chain_add(
                sampler, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

        std::string response;
        response.reserve(1024);

        try {
            const int limit = std::clamp(
                    static_cast<int>(maxTokens), 1, 1024);

            for (int i = 0; i < limit; ++i) {
                const llama_token token =
                        llama_sampler_sample(sampler, g_context, -1);

                if (llama_vocab_is_eog(g_vocab, token)) {
                    break;
                }

                response += tokenToText(token);

                // Feed the generated token back to obtain the next one.
                if (i + 1 < limit) {
                    llama_batch nextBatch =
                            llama_batch_get_one(
                                    const_cast<llama_token *>(&token), 1);

                    const int32_t result =
                            llama_decode(g_context, nextBatch);

                    if (result != 0) {
                        throw std::runtime_error(
                                "Failed while generating the response.");
                    }
                }
            }
        } catch (...) {
            llama_sampler_free(sampler);
            throw;
        }

        llama_sampler_free(sampler);

        if (response.empty()) {
            response = "I'm sorry, I couldn't generate a response.";
        }

        return env->NewStringUTF(response.c_str());

    } catch (const std::exception &e) {
        throwJavaException(
                env, "java/lang/IllegalStateException", e.what());
        return nullptr;
    } catch (...) {
        throwJavaException(
                env, "java/lang/IllegalStateException",
                "Unknown error while generating a response.");
        return nullptr;
    }
}

JNIEXPORT void JNICALL
Java_com_yantrigo_assistant_LlamaNative_nativeShutdown(
        JNIEnv *,
        jclass) {

    std::lock_guard<std::mutex> lock(g_mutex);
    releaseModel();
}

} // extern "C"