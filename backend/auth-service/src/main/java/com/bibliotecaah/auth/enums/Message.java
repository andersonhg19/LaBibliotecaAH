package com.bibliotecaah.auth.enums;

public class Message {

    private Message() {}

    public enum Msj {
        emailAlreadyInUse,
        userNotFound,
        invalidCredentials,
        userInactive,
        passwordRequired,
        userSavedSuccessfully,
        userUpdatedSuccessfully,
        userDeletedSuccessfully,
        userListRetrieved,
        roleNotFound,
        roleAlreadyExists,
        roleInUse,
        systemRoleCannotChange,
        lastAdminCannotLoseRole,
        cannotDeactivateSelf,
        pageNotFound,
        adminKeepsAdminModule,
        // Alias y login con correo o alias (V3). Textos en messages_es.properties.
        aliasObligatorio,
        aliasInvalido,
        aliasNoDisponible,
        usuarioObligatorio,
        credencialesIncorrectas,
        claveDeOtraCuenta,
        // Ola de seguridad (QA SE-02, SE-03, SE-09, SE-11).
        registroCerrado,
        sesionNoVigente,
        claveDebil,
        rutaInvalida,
        rutaNoEncontrada,
        errorInesperado
    }
}
