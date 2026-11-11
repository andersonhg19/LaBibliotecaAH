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
        adminKeepsAdminModule
    }
}
