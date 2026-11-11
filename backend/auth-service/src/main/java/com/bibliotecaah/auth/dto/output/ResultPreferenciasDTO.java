package com.bibliotecaah.auth.dto.output;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Lo que la web necesita saber de la instalacion al arrancar: como se llama la
 * app y en que idioma/formato regional se muestran fechas y numeros.
 *
 * Viene RESUELTO desde la configuracion global (bah_auth_app_config). En Oh
 * Churus llevaba ademas moneda y decimales; aqui no hay importes.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResultPreferenciasDTO {

    private String appName;
    private String locale;
}
