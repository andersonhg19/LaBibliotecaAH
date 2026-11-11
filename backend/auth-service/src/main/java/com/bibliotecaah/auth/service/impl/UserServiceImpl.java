package com.bibliotecaah.auth.service.impl;

import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserRegisterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultUserDTO;
import com.bibliotecaah.auth.entity.Role;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.mapper.UserMapper;
import com.bibliotecaah.auth.repository.RoleRepository;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.enums.Message;
import com.bibliotecaah.auth.security.EmisorDeTokens;
import com.bibliotecaah.auth.util.Mensajes;
import com.bibliotecaah.auth.service.UserService;
import com.bibliotecaah.auth.util.SecurityUtils;
import com.bibliotecaah.auth.util.ValidacionDeAlias;
import com.bibliotecaah.auth.util.ValidationUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Set;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final ValidacionDeAlias validacionDeAlias;
    private final EmisorDeTokens tokens;
    private final Mensajes mensajes;

    public UserServiceImpl(UserRepository userRepository,
                           RoleRepository roleRepository,
                           PasswordEncoder passwordEncoder,
                           UserMapper userMapper,
                           ValidacionDeAlias validacionDeAlias,
                           EmisorDeTokens tokens,
                           Mensajes mensajes) {
        this.tokens = tokens;
        this.mensajes = mensajes;
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
        this.validacionDeAlias = validacionDeAlias;
    }

    /**
     * Alta publica. No delega en saveAndUpdate a proposito: ese metodo decide
     * entre crear y actualizar mirando si viene "id", y por esa puerta se podia
     * secuestrar la cuenta de cualquiera sin estar autenticado. Aqui no hay
     * decision posible: siempre crea.
     */
    /** ¿El id es el del usuario autenticado? Sin sesion, siempre no. */
    private boolean esYo(Long id) {
        Long yo = com.bibliotecaah.auth.util.SecurityUtils.getAuthenticatedUserId();
        return yo != null && yo.equals(id);
    }

    @Override
    public ResultDTO register(UserRegisterDTO dto) {
        try {
            UserSaveDTO alta = new UserSaveDTO();
            alta.setName(dto.getName());
            alta.setEmail(dto.getEmail());
            alta.setAlias(dto.getAlias());
            alta.setPassword(dto.getPassword());
            return createUser(alta);
        } catch (Exception e) {
            log.error("Error registering user: {}", e.getMessage(), e);
            return new ResultDTO(false, "No se pudo guardar el usuario", 500);
        }
    }

    @Override
    public ResultDTO saveAndUpdate(UserSaveDTO dto) {
        try {
            /* /v1/users/save solo EDITA tu propia cuenta. Antes, sin "id",
               creaba cuentas: cualquier usuario con token, sin rol alguno,
               daba de alta a quien quisiera (QA M3). Las altas van por
               /v1/auth/register o, para un administrador, /v1/admin/users/save. */
            if (dto.getId() == null) {
                return new ResultDTO(false,
                        "Las cuentas nuevas se crean desde el registro o desde Administración", 403);
            }
            return updateUser(dto);
        } catch (Exception e) {
            log.error("Error saving user: {}", e.getMessage(), e);
            return new ResultDTO(false, "No se pudo guardar el usuario", 500);
        }
    }

    private ResultDTO createUser(UserSaveDTO dto) {
        if (dto.getPassword() == null || dto.getPassword().isBlank()) {
            return new ResultDTO(false, "La contraseña es obligatoria", 101);
        }

        if (ValidationUtils.esClaveDebil(dto.getPassword())) {
            return new ResultDTO(false, mensajes.texto(Message.Msj.claveDebil), ValidacionDeAlias.DATO_INVALIDO);
        }
        dto.setEmail(ValidationUtils.normalizarCorreo(dto.getEmail()));
        /* Activa O NO y sin distinguir mayusculas (QA SE-04 y SE-10): antes solo
           miraba las activas y el correo exacto, asi que el de una cuenta
           desactivada daba un 500 y "ANA@x" creaba una gemela de "ana@x". */
        if (userRepository.existeCorreo(dto.getEmail())) {
            /* No hay forma de rechazar un correo repetido sin revelar que
               existe (sin verificacion por correo); al menos el mensaje no lo
               grita y lleva a iniciar sesion. */
            return new ResultDTO(false,
                    "No se pudo crear la cuenta con ese correo. Si ya tienes una, inicia sesión.", 102);
        }

        /* El alias es obligatorio en el alta (V3): con el se puede entrar. */
        Optional<ResultDTO> aliasMalo = validacionDeAlias.problema(dto.getAlias(), null);
        if (aliasMalo.isPresent()) {
            return aliasMalo.get();
        }

        /* El alta publica nace con el rol USER. En Oh Churus se creaba sin
           ningun rol: el token era valido pero el menu llegaba vacio y la
           persona no podia hacer nada (hueco cerrado aqui). Si el rol no
           existiera (base a medio migrar) la cuenta se crea igual y queda en
           el log para arreglarla desde Administracion. */
        Set<Role> roles = new HashSet<>();
        roleRepository.findByNameAndActiveTrue(SecurityUtils.ROL_USER).ifPresentOrElse(
                roles::add,
                () -> log.warn("No existe el rol {}; la cuenta {} se crea sin rol",
                        SecurityUtils.ROL_USER, dto.getEmail()));

        User user = User.builder()
                .name(dto.getName())
                .email(dto.getEmail())
                .alias(ValidationUtils.normalizarAlias(dto.getAlias()))
                .password(passwordEncoder.encode(dto.getPassword()))
                .active(true)
                .roles(roles)
                .build();

        User saved = userRepository.save(user);
        log.info("User created: {}", saved.getEmail());
        return new ResultDTO(userMapper.toResultDTO(saved));
    }

    private ResultDTO updateUser(UserSaveDTO dto) {
        /* Editar la cuenta de otro no es una operacion que exista en esta app.
           Se responde "no encontrado" y no "no puedes", para no confirmar que
           ese id existe. */
        if (!esYo(dto.getId())) {
            return new ResultDTO(false, "Usuario no encontrado", 103);
        }
        Optional<User> existing = userRepository.findByIdAndActiveTrue(dto.getId());
        if (existing.isEmpty()) {
            return new ResultDTO(false, "Usuario no encontrado", 103);
        }

        dto.setEmail(ValidationUtils.normalizarCorreo(dto.getEmail()));
        if (userRepository.existeCorreoEnOtraCuenta(dto.getEmail(), dto.getId())) {
            return new ResultDTO(false, "Ese correo no está disponible", 102);
        }

        /* El alias es opcional al editar: si no llega, se conserva. Si llega,
           pasa las mismas reglas que en el alta (sin contar la propia cuenta
           en la unicidad: guardar sin cambiarlo no es un duplicado). */
        if (dto.getAlias() != null) {
            Optional<ResultDTO> aliasMalo = validacionDeAlias.problema(dto.getAlias(), dto.getId());
            if (aliasMalo.isPresent()) {
                return aliasMalo.get();
            }
        }

        User user = existing.get();

        /* Cambiar la contrasena exige la actual (QA A3). Se comprueba ANTES de
           tocar nada para no guardar a medias el resto de cambios. */
        boolean cambiaClave = dto.getPassword() != null && !dto.getPassword().isBlank();
        if (cambiaClave && (dto.getCurrentPassword() == null || dto.getCurrentPassword().isEmpty()
                || !passwordEncoder.matches(dto.getCurrentPassword(), user.getPassword()))) {
            log.warn("Cambio de contrasena rechazado: la actual no coincide (usuario {})", user.getId());
            return new ResultDTO(false, "La contraseña actual no es correcta", 400);
        }
        if (cambiaClave && ValidationUtils.esClaveDebil(dto.getPassword())) {
            return new ResultDTO(false, mensajes.texto(Message.Msj.claveDebil), ValidacionDeAlias.DATO_INVALIDO);
        }

        user.setName(dto.getName());
        user.setEmail(dto.getEmail());
        if (dto.getAlias() != null) {
            user.setAlias(ValidationUtils.normalizarAlias(dto.getAlias()));
        }

        if (cambiaClave) {
            user.setPassword(passwordEncoder.encode(dto.getPassword()));
            /* QA SE-02: cambiar la clave cierra las demas sesiones (un token
               robado deja de valer). La sesion actual recibe un token nuevo en
               la respuesta para no echar a quien acaba de cambiarla. */
            user.revocarSesiones();
        }

        User saved = userRepository.save(user);
        log.info("User updated: {}", saved.getEmail());
        ResultUserDTO salida = userMapper.toResultDTO(saved);
        if (cambiaClave) {
            User conRoles = userRepository.findByIdWithRoles(saved.getId()).orElse(saved);
            salida.setToken(tokens.emitir(saved, EmisorDeTokens.rolesActivos(conRoles)));
        }
        return new ResultDTO(salida);
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getById(Long id) {
        /* Solo tu propia cuenta. Antes cualquier autenticado leia la ficha de
           cualquiera probando ids consecutivos: nombre y correo de todos.
           La comprobacion era correcta pero se hacia dos veces, y la primera
           llamaba a equals() sobre el resultado de getAuthenticatedUserId(),
           que devuelve null cuando no hay sesion: un NullPointerException
           esperando a que alguien llegase aqui sin token. esYo() ya trata el
           null como "no", que es lo que hay que hacer con la ausencia de dato.
           Un administrador que quiera ver la ficha de otro usa /v1/admin. */
        if (!esYo(id)) {
            return new ResultDTO(false, "Usuario no encontrado", 103);
        }
        Optional<User> user = userRepository.findByIdAndActiveTrue(id);
        if (user.isEmpty()) {
            return new ResultDTO(false, "Usuario no encontrado", 103);
        }
        return new ResultDTO(userMapper.toResultDTO(user.get()));
    }

    @Override
    @Transactional(readOnly = true)
    public ResultDTO getAll(UserFilterDTO filter) {
        /*
         * ESTO NO ES UN DIRECTORIO ABIERTO.
         *
         * Cualquier autenticado podia listar a TODOS los usuarios de la
         * plataforma con nombre y correo, y de paso con un LIKE: buscar "a"
         * los sacaba a todos.
         *
         * Se usa para UNA cosa legitima: buscar a alguien por un correo
         * concreto (por ejemplo, para compartir). Ese caso necesita conocer el
         * correo de antemano. Asi que:
         *   · sin correo en el filtro -> solo te devuelves a ti mismo,
         *   · con correo -> coincidencia EXACTA, nunca parcial.
         * Se pierde el listado libre, que no lo usaba ninguna pantalla.
         */
        String correoBuscado = filter.getEmail() == null ? null : ValidationUtils.normalizarCorreo(filter.getEmail());
        Pageable pageable = PageRequest.of(filter.getPage(), filter.getSize(), Sort.by("name").ascending());

        Page<User> page;
        if (correoBuscado == null || correoBuscado.isEmpty()) {
            Long yo = com.bibliotecaah.auth.util.SecurityUtils.getAuthenticatedUserId();
            List<User> soloYo = (yo == null)
                    ? List.of()
                    : userRepository.findByIdAndActiveTrue(yo).map(List::of).orElse(List.of());
            page = new org.springframework.data.domain.PageImpl<>(soloYo, pageable, soloYo.size());
        } else {
            List<User> exacto = userRepository.findByEmailAndActiveTrue(correoBuscado)
                    .map(List::of).orElse(List.of());
            page = new org.springframework.data.domain.PageImpl<>(exacto, pageable, exacto.size());
        }

        List<ResultUserDTO> list = page.getContent().stream()
                .map(userMapper::toResultDTO)
                .collect(Collectors.toList());

        Map<String, Object> response = new HashMap<>();
        response.put("page", page.getNumber());
        response.put("size", page.getSize());
        response.put("totalPage", page.getTotalPages());
        response.put("totalElements", page.getTotalElements());
        response.put("list", list);

        return new ResultDTO(response);
    }

    @Override
    public ResultDTO delete(Long id) {
        /* Darse de baja es cosa de uno. Sin esta comprobacion, cualquier
           usuario autenticado desactivaba la cuenta de otro con solo su id, y
           el dueno se quedaba sin poder entrar sin saber por que. */
        if (!esYo(id)) {
            return new ResultDTO(false, "Usuario no encontrado", 103);
        }
        Optional<User> user = userRepository.findByIdAndActiveTrue(id);
        if (user.isEmpty()) {
            return new ResultDTO(false, "Usuario no encontrado", 103);
        }

        User entity = user.get();
        entity.setActive(false);
        entity.revocarSesiones();
        userRepository.save(entity);
        log.info("User deleted (soft): {}", entity.getEmail());
        return new ResultDTO(true, "User deleted successfully", 0);
    }
}
