package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.input.AuditoriaFilterDTO;
import com.bibliotecaah.auth.dto.output.ResultAuditoriaDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.entity.AuditLog;
import com.bibliotecaah.auth.repository.AuditLogRepository;
import com.bibliotecaah.auth.service.AuditoriaService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Consultar la auditoria. Solo consultar: no hay metodo para escribir a mano
 * ni para corregir una linea, y esa ausencia es el diseno — un registro que se
 * puede retocar no prueba nada.
 */
@Service
public class AuditoriaServiceImpl implements AuditoriaService {

    private final AuditLogRepository auditoria;

    public AuditoriaServiceImpl(AuditLogRepository auditoria) {
        this.auditoria = auditoria;
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO consultar(AuditoriaFilterDTO filtro) {
        Pageable pageable = PageRequest.of(filtro.getPage(), filtro.getSize());
        LocalDateTime desde = filtro.getUltimosDias() == null
                ? null
                : LocalDateTime.now().minusDays(filtro.getUltimosDias());

        Page<AuditLog> pagina = auditoria.buscar(
                filtro.getActorUserId(),
                (filtro.getEntityType() == null || filtro.getEntityType().isBlank())
                        ? null : filtro.getEntityType().trim(),
                desde,
                pageable);

        List<ResultAuditoriaDTO> lista = pagina.getContent().stream()
                .map(a -> new ResultAuditoriaDTO(
                        a.getId(), a.getActorUserId(), a.getActorEmail(),
                        a.getEntityType(), a.getEntityId(),
                        a.getAction() == null ? null : a.getAction().name(),
                        a.getDetails(), a.getOccurredAt()))
                .toList();

        Map<String, Object> respuesta = new HashMap<>();
        respuesta.put("page", pagina.getNumber());
        respuesta.put("size", pagina.getSize());
        respuesta.put("totalPage", pagina.getTotalPages());
        respuesta.put("totalElements", pagina.getTotalElements());
        respuesta.put("list", lista);
        return new ResultDTO(respuesta);
    }
}
