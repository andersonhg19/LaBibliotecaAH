package com.bibliotecaah.biblioteca.event;

/**
 * Un cambio en una entidad del dominio, para el registro de cambios
 * (estandares §21). Los datos van explicitos: el listener no desmonta entidades.
 */
public record EntityChangeEvent(String entidad, String entidadId, Accion accion, Long usuarioId, String detalle) {

    public enum Accion { CREAR, ACTUALIZAR, BORRAR }
}
