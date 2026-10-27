cmake_minimum_required(VERSION 3.16)

project(xyro_llama LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT DEFINED LLAMA_CPP_DIR)
    message(FATAL_ERROR
        "Set LLAMA_CPP_DIR to your llama.cpp source directory.")
endif()

if(NOT DEFINED JAVA_HOME)
    message(FATAL_ERROR
        "Set JAVA_HOME to your installed JDK directory.")
endif()

find_library(LLAMA_LIBRARY
    NAMES llama
    PATHS "${LLAMA_CPP_DIR}/build/bin"
    NO_DEFAULT_PATH
    REQUIRED
)

add_library(xyro_llama SHARED xyro_llama.cpp)

target_include_directories(xyro_llama PRIVATE
    "${JAVA_HOME}/include"
    "${JAVA_HOME}/include/linux"
    "${LLAMA_CPP_DIR}/include"
    "${LLAMA_CPP_DIR}/ggml/include"
)

target_link_libraries(xyro_llama PRIVATE "${LLAMA_LIBRARY}")

set_target_properties(xyro_llama PROPERTIES
    OUTPUT_NAME "xyro_llama"
    BUILD_RPATH "${LLAMA_CPP_DIR}/build/bin"
    INSTALL_RPATH "${LLAMA_CPP_DIR}/build/bin"
)