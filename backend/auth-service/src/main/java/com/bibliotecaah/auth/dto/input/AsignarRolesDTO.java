package com.bibliotecaah.auth.dto.input;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Los roles que tendra ese usuario cuando esto termine.
 *
 * Es la lista COMPLETA, no un anadir ni un quitar. Se eligio asi porque las
 * dos alternativas —un endpoint de anadir y otro de quitar— dejan la pantalla
 * teniendo que adivinar el estado intermedio si una de las dos llamadas falla,
 * y porque una lista vacia expresa sin ambiguedad "este usuario se queda sin
 * roles", que es una operacion legitima.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AsignarRolesDTO {

    @NotNull(message = "es obligatorio")
    private List<String> roles = new ArrayList<>();
}
