package com.bibliotecaah.auth.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResultAuditoriaDTO {

    private Long id;
    private Long actorUserId;
    private String actorEmail;
    private String entityType;
    private Long entityId;
    private String action;
    private String details;
    private LocalDateTime occurredAt;
}
