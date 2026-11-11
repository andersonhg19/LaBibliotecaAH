-- ============================================================================
-- V4 — Orden "Autor" por apellido (QA BI-24)
-- ============================================================================
--
-- Antes se ordenaba por lower(autores[1]): "Ana Zubiria" salia antes que
-- "Zoe Abad" porque mandaba el nombre de pila. bah_clave_autor(autor) da la
-- clave de orden del apellido:
--
--   · sin tildes ni dieresis y en minusculas ("Márquez" -> "marquez");
--   · formato "Apellido, Nombre": lo que va antes de la coma, sin particulas
--     delante ("Tolkien, J. R. R." -> "tolkien"; "de Cervantes, Miguel" ->
--     "cervantes");
--   · si no: la ultima palabra ("Gabriel García Márquez" -> "marquez",
--     "Jorge Luis Borges" -> "borges"). Las particulas "de", "del", "de la",
--     "de los", "van", "van der", "von", "da", "di" no cuentan como apellido
--     ("Miguel de Cervantes" -> "cervantes", "Ludwig van Beethoven" ->
--     "beethoven"); los articulos que si forman parte del apellido se quedan
--     ("Ursula K. Le Guin" -> "le guin"; pero "Juan de la Cruz" -> "cruz");
--   · "Jr.", "Sr.", "II", "III" al final no son el apellido.
--
-- Es una funcion IMMUTABLE que se calcula al ordenar: no hace falta columna
-- ni relleno, sirve igual para las obras existentes y para las nuevas, y no
-- se puede desincronizar de autores. Las bibliotecas son pequenas (dos
-- usuarios); si algun dia hiciera falta, admite un indice de expresion.
-- ============================================================================

CREATE OR REPLACE FUNCTION bah_clave_autor(autor TEXT) RETURNS TEXT
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$$
DECLARE
    limpio  TEXT;
    tokens  TEXT[];
    n       INT;
    clave   TEXT;
BEGIN
    IF autor IS NULL THEN
        RETURN NULL;
    END IF;
    limpio := lower(translate(autor,
        'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕØóòôöõøÚÙÛÜúùûüÑñÇçÝýÿ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuNnCcYyy'));
    limpio := btrim(regexp_replace(limpio, '\s+', ' ', 'g'));
    IF limpio = '' THEN
        RETURN NULL;
    END IF;

    IF position(',' IN limpio) > 1 THEN
        -- "Apellido, Nombre": el apellido, sin particulas delante.
        clave := btrim(split_part(limpio, ',', 1));
        clave := regexp_replace(clave, '^((de|del|de la|de las|de los|van|van der|van den|von|da|di|do|dos|das) )+', '');
        RETURN NULLIF(clave, '');
    END IF;

    tokens := regexp_split_to_array(limpio, ' ');
    n := array_length(tokens, 1);
    -- "Jr.", "Sr.", "II"… al final no son el apellido.
    IF n > 1 AND tokens[n] IN ('jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv') THEN
        n := n - 1;
    END IF;
    clave := tokens[n];
    -- Articulos que forman parte del apellido (Le Guin, La Fontaine sin "de"…).
    IF n > 1 AND tokens[n - 1] IN ('le', 'la', 'les', 'du', 'des', 'mac', 'mc', 'st.', 'saint')
            AND (n = 2 OR tokens[n - 2] NOT IN ('de', 'del')) THEN
        clave := tokens[n - 1] || ' ' || clave;
    END IF;
    RETURN clave;
END;
$$;
