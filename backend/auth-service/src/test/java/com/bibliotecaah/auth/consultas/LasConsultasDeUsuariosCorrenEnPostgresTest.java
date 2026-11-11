package com.bibliotecaah.auth.consultas;

import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ============================================================================
 * LA UNICA @Query DE auth-service, CONTRA UN POSTGRESQL DE VERDAD
 * ============================================================================
 *
 * `findAllWithFilters` es la consulta del buscador de usuarios y tiene las dos
 * cosas que peor viajan de H2 a PostgreSQL:
 *
 *   · `(:name IS NULL OR ...)`. Un parametro que solo aparece comparado con
 *     NULL no le dice a PostgreSQL de que tipo es, y el servidor contesta
 *     "could not determine data type of parameter". H2 no se entera de nada y
 *     lo deja pasar. El `CAST(... AS string)` del JPQL esta puesto justo para
 *     eso, y esta prueba es lo unico que comprueba que sigue bastando.
 *   · `LOWER(...) LIKE LOWER(...)`. La insensibilidad a mayusculas depende de
 *     la intercalacion del motor; H2 y PostgreSQL no tienen la misma.
 *
 * Se comprueba el RESULTADO, no que la llamada no reviente: una consulta que
 * devuelve la pagina vacia tampoco revienta, y la pagina vacia es el bug.
 */
@DisplayName("La consulta del buscador de usuarios funciona en PostgreSQL")
class LasConsultasDeUsuariosCorrenEnPostgresTest extends PostgresDeVerdad {

    @Autowired private UserRepository usuarios;

    @BeforeEach
    void sembrarElDirectorio() {
        usuarios.deleteAll();
        usuarios.saveAll(java.util.List.of(
                usuario("Anderson Gomez", "anderson@biblioteca.ah", true),
                usuario("Samy Restrepo", "samy@biblioteca.ah", true),
                usuario("Ana Maria", "ANA.MARIA@biblioteca.ah", true),
                usuario("Fantasma Borrado", "fantasma@biblioteca.ah", false)));
        usuarios.flush();
    }

    private User usuario(String nombre, String correo, boolean vivo) {
        return User.builder()
                .name(nombre).email(correo).password("$2a$10$hashDePrueba")
                .active(vivo)
                .build();
    }

    // ========================================================================

    @Test
    @DisplayName("sin filtros devuelve a los vivos y a nadie mas")
    void sinFiltrosSalenSoloLosVivos() {
        Page<User> pagina = usuarios.findAllWithFilters(null, null, PageRequest.of(0, 10));

        assertThat(pagina.getContent())
                .as("los dos parametros nulos son el caso mas fragil en PostgreSQL: si el "
                        + "servidor no puede inferir su tipo, aqui no llega ni una fila")
                .extracting(User::getEmail)
                .containsExactlyInAnyOrder(
                        "anderson@biblioteca.ah", "samy@biblioteca.ah", "ANA.MARIA@biblioteca.ah");
    }

    @Test
    @DisplayName("el filtro de nombre es parcial y no distingue mayusculas")
    void elNombreBuscaPorTrozoYSinDistinguirMayusculas() {
        Page<User> pagina = usuarios.findAllWithFilters("ANDER", null, PageRequest.of(0, 10));

        assertThat(pagina.getContent())
                .as("buscar \"ANDER\" tiene que encontrar a \"Anderson Gomez\": el LOWER de "
                        + "ambos lados depende de la intercalacion del motor")
                .extracting(User::getName)
                .containsExactly("Anderson Gomez");
    }

    @Test
    @DisplayName("el filtro de correo tambien es parcial y tampoco distingue mayusculas")
    void elCorreoBuscaPorTrozoYSinDistinguirMayusculas() {
        Page<User> pagina = usuarios.findAllWithFilters(null, "ana.maria", PageRequest.of(0, 10));

        assertThat(pagina.getContent())
                .extracting(User::getEmail)
                .containsExactly("ANA.MARIA@biblioteca.ah");
    }

    @Test
    @DisplayName("los dos filtros a la vez se suman (Y), no se acumulan (O)")
    void losDosFiltrosSeCombinanConY() {
        /* Si un dia alguien cambia el AND por un OR, el buscador devolveria de
           mas y una prueba con un solo filtro no lo notaria. */
        Page<User> pagina = usuarios.findAllWithFilters("Samy", "anderson", PageRequest.of(0, 10));

        assertThat(pagina.getContent())
                .as("nadie se llama Samy y tiene el correo de Anderson: la pagina debe venir vacia")
                .isEmpty();
    }

    @Test
    @DisplayName("un usuario desactivado no aparece por mucho que se le busque por su nombre")
    void elDesactivadoNoAparece() {
        Page<User> pagina = usuarios.findAllWithFilters("Fantasma", null, PageRequest.of(0, 10));

        assertThat(pagina.getContent())
                .as("el borrado de esta app es logico: si el active=true se cae de la consulta, "
                        + "las cuentas borradas vuelven a la vida en el buscador")
                .isEmpty();
    }

    @Test
    @DisplayName("la cuenta total de la paginacion sale de PostgreSQL, no de la pagina")
    void laPaginacionCuentaBien() {
        /* Spring Data deriva la consulta de conteo de la de datos. Esa derivada
           NO esta escrita en ningun sitio del proyecto y es la que mas veces se
           rompe al tocar el JPQL; aqui se ejecuta de verdad. */
        Page<User> primera = usuarios.findAllWithFilters(null, "biblioteca.ah", PageRequest.of(0, 2));

        assertThat(primera.getTotalElements()).isEqualTo(3);
        assertThat(primera.getTotalPages()).isEqualTo(2);
        assertThat(primera.getContent()).hasSize(2);
    }
}
