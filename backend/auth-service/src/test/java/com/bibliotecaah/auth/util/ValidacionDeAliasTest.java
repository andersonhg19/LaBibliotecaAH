package com.bibliotecaah.auth.util;

import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.enums.Message;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Reglas del alias")
class ValidacionDeAliasTest {

    private static final String INVALIDO = "El usuario debe tener de 3 a 30 caracteres: letras sin tilde, números, "
            + "punto (.), guion (-) o guion bajo (_). Sin espacios ni @.";

    @Mock private UserRepository usuarios;

    private ValidacionDeAlias validacion;

    @BeforeEach
    void preparar() {
        validacion = new ValidacionDeAlias(usuarios, MensajesDePrueba.reales());
    }

    @Nested
    @DisplayName("normalizar y formato (ValidationUtils)")
    class Formato {

        @Test
        @DisplayName("normalizar recorta y pasa a minusculas; vacio es null")
        void normalizar() {
            assertThat(ValidationUtils.normalizarAlias("  Anderson ")).isEqualTo("anderson");
            assertThat(ValidationUtils.normalizarAlias("   ")).isNull();
            assertThat(ValidationUtils.normalizarAlias(null)).isNull();
        }

        @ParameterizedTest(name = "\"{0}\" vale")
        @ValueSource(strings = {"ana", "anderson", "samy.h", "a_b-c.d", "abc123", "123", "abcdefghijklmnopqrstuvwxyz1234"})
        @DisplayName("formatos validos")
        void validos(String alias) {
            assertThat(ValidationUtils.esAliasValido(alias)).isTrue();
        }

        @ParameterizedTest(name = "\"{0}\" no vale")
        @ValueSource(strings = {"ab", "abcdefghijklmnopqrstuvwxyz12345", "ana@x", "an a", "andrés", "ANA", "ana!", ""})
        @DisplayName("formatos invalidos: corto, largo, con @, espacio, tilde, mayuscula, simbolo")
        void invalidos(String alias) {
            assertThat(ValidationUtils.esAliasValido(alias)).isFalse();
        }

        @Test
        @DisplayName("null no es un alias valido")
        void nulo() {
            assertThat(ValidationUtils.esAliasValido(null)).isFalse();
        }
    }

    @Nested
    @DisplayName("problema()")
    class Problema {

        @Test
        @DisplayName("sin alias: obligatorio, errorCode 400, sin tocar la base")
        void obligatorio() {
            ResultDTO error = validacion.problema("  ", null).orElseThrow();

            assertThat(error.isCorrect()).isFalse();
            assertThat(error.getErrorCode()).isEqualTo(400);
            assertThat(error.getMessage()).isEqualTo("Elige un nombre de usuario.");
            verifyNoInteractions(usuarios);
        }

        @Test
        @DisplayName("con @: invalido (asi el login nunca confunde alias y correo)")
        void conArroba() {
            ResultDTO error = validacion.problema("ana@biblioteca.ah", null).orElseThrow();

            assertThat(error.getErrorCode()).isEqualTo(400);
            assertThat(error.getMessage()).isEqualTo(INVALIDO);
            verifyNoInteractions(usuarios);
        }

        @Test
        @DisplayName("corto: invalido")
        void corto() {
            assertThat(validacion.problema("ab", null).orElseThrow().getMessage()).isEqualTo(INVALIDO);
        }

        @Test
        @DisplayName("alta con alias ya usado (sin distinguir mayusculas): no disponible, errorCode 112")
        void duplicadoEnAlta() {
            when(usuarios.existsByAlias("samy")).thenReturn(true);

            ResultDTO error = validacion.problema(" SAMY ", null).orElseThrow();

            assertThat(error.getErrorCode()).isEqualTo(112);
            assertThat(error.getMessage()).isEqualTo("Ese nombre de usuario ya está en uso. Prueba con otro.");
        }

        @Test
        @DisplayName("edicion: la propia cuenta no cuenta como duplicado")
        void edicionPropia() {
            when(usuarios.existsByAliasAndIdNot("samy", 4L)).thenReturn(false);

            assertThat(validacion.problema("Samy", 4L)).isEmpty();
            verify(usuarios, never()).existsByAlias(anyString());
        }

        @Test
        @DisplayName("edicion: el alias de otra cuenta no se puede tomar")
        void edicionAjena() {
            when(usuarios.existsByAliasAndIdNot("samy", 5L)).thenReturn(true);

            assertThat(validacion.problema("samy", 5L).orElseThrow().getErrorCode()).isEqualTo(112);
        }

        @Test
        @DisplayName("alta con alias libre: sin problema")
        void libre() {
            when(usuarios.existsByAlias("nuevo")).thenReturn(false);

            assertThat(validacion.problema("nuevo", null)).isEqualTo(Optional.empty());
            verify(usuarios, never()).existsByAliasAndIdNot(anyString(), anyLong());
        }
    }

    @Test
    @DisplayName("todos los mensajes nuevos tienen texto en messages_es.properties")
    void mensajesConTexto() {
        Mensajes mensajes = MensajesDePrueba.reales();
        for (Message.Msj clave : new Message.Msj[]{Message.Msj.aliasObligatorio, Message.Msj.aliasInvalido,
                Message.Msj.aliasNoDisponible, Message.Msj.usuarioObligatorio,
                Message.Msj.credencialesIncorrectas, Message.Msj.claveDeOtraCuenta}) {
            assertThat(mensajes.texto(clave)).as(clave.name()).isNotEqualTo(clave.name());
        }
    }
}
