package com.bibliotecaah.auth.dto.output;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor
@Getter
@Setter
public class ResultDTO {

    @JsonProperty("correct")
    private boolean isCorrect;

    @JsonProperty("message")
    private String message;

    @JsonProperty("errorCode")
    private int errorCode;

    @JsonProperty("object")
    private Object object;

    public ResultDTO(Object object) {
        this.isCorrect = true;
        this.message = "OK";
        this.errorCode = 0;
        this.object = object;
    }

    public ResultDTO(boolean isCorrect, String message, int errorCode) {
        this.isCorrect = isCorrect;
        this.message = message;
        this.errorCode = errorCode;
        this.object = null;
    }

    public ResultDTO(boolean isCorrect, String message, int errorCode, Object object) {
        this.isCorrect = isCorrect;
        this.message = message;
        this.errorCode = errorCode;
        this.object = object;
    }
}
