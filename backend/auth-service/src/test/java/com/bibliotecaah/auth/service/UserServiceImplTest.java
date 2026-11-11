package com.bibliotecaah.auth.service;

import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultUserDTO;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.mapper.UserMapper;
import com.bibliotecaah.auth.repository.UserRepository;
import com.bibliotecaah.auth.service.impl.UserServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private com.bibliotecaah.auth.repository.RoleRepository roleRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private UserMapper userMapper;
    /* La identidad ya no llega por parametro: sale del token, y varias
       operaciones exigen ahora que sea TU cuenta. Estas pruebas son unitarias
       y no hay token, asi que se planta a mano para poder seguir probando la
       LOGICA. Que un extrano NO pueda lo comprueba AislamientoDeCuentasTest. */
    @org.junit.jupiter.api.BeforeEach
    void plantarIdentidad() {
        var auth = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                "test@biblioteca.ah", null, java.util.Collections.emptyList());
        auth.setDetails(1L);
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(auth);
    }

    @org.junit.jupiter.api.AfterEach
    void limpiarIdentidad() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }


    @InjectMocks
    private UserServiceImpl userService;

    private User testUser;
    private ResultUserDTO testResultDTO;
    private UserSaveDTO testSaveDTO;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(1L)
                .name("Test User")
                .email("test@biblioteca.ah")
                .password("encoded-password")
                
                .active(true)
                .build();

        testResultDTO = new ResultUserDTO();
        testResultDTO.setId(1L);
        testResultDTO.setName("Test User");
        testResultDTO.setEmail("test@biblioteca.ah");
        testResultDTO.setActive(true);

        testSaveDTO = new UserSaveDTO();
        testSaveDTO.setName("Test User");
        testSaveDTO.setEmail("test@biblioteca.ah");
        testSaveDTO.setPassword("Password123!");
    }

    @Nested
    @DisplayName("register - Create")
    class CreateTests {

        /* Las altas ya no pasan por saveAndUpdate (QA M3): se prueban por
           register, que es la puerta publica y comparte la logica de alta. */
        private ResultDTO registrar() {
            com.bibliotecaah.auth.dto.input.UserRegisterDTO alta = new com.bibliotecaah.auth.dto.input.UserRegisterDTO();
            alta.setName(testSaveDTO.getName());
            alta.setEmail(testSaveDTO.getEmail());
            alta.setPassword(testSaveDTO.getPassword());
            return userService.register(alta);
        }

        @Test
        @DisplayName("saveAndUpdate sin id ya no crea cuentas")
        void saveSinIdNoCrea() {
            ResultDTO result = userService.saveAndUpdate(testSaveDTO);

            assertFalse(result.isCorrect());
            assertEquals(403, result.getErrorCode());
            verify(userRepository, never()).save(any(User.class));
        }

        @Test
        @DisplayName("el registro publico nace con el rol USER")
        void registroAsignaUser() {
            com.bibliotecaah.auth.entity.Role user = com.bibliotecaah.auth.entity.Role.builder()
                    .id(2L).name("USER").active(true).build();
            when(roleRepository.findByNameAndActiveTrue("USER")).thenReturn(Optional.of(user));
            when(userRepository.existsByEmailAndActiveTrue("test@biblioteca.ah")).thenReturn(false);
            when(passwordEncoder.encode("Password123!")).thenReturn("encoded-password");
            when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));
            when(userMapper.toResultDTO(any(User.class))).thenReturn(testResultDTO);

            assertTrue(registrar().isCorrect());
            verify(userRepository).save(argThat(u -> u.tieneRol("USER")));
        }

        @Test
        @DisplayName("si el rol USER no existe, la cuenta se crea igual (sin rol) y se avisa")
        void registroSinRolUser() {
            when(roleRepository.findByNameAndActiveTrue("USER")).thenReturn(Optional.empty());
            when(userRepository.existsByEmailAndActiveTrue("test@biblioteca.ah")).thenReturn(false);
            when(passwordEncoder.encode("Password123!")).thenReturn("encoded-password");
            when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));
            when(userMapper.toResultDTO(any(User.class))).thenReturn(testResultDTO);

            assertTrue(registrar().isCorrect());
            verify(userRepository).save(argThat(u -> u.getRoles().isEmpty()));
        }

        @Test
        @DisplayName("Should create user successfully")
        void shouldCreateUserSuccessfully() {
            when(userRepository.existsByEmailAndActiveTrue("test@biblioteca.ah")).thenReturn(false);
            when(passwordEncoder.encode("Password123!")).thenReturn("encoded-password");
            when(userRepository.save(any(User.class))).thenReturn(testUser);
            when(userMapper.toResultDTO(any(User.class))).thenReturn(testResultDTO);

            ResultDTO result = registrar();

            assertTrue(result.isCorrect());
            assertNotNull(result.getObject());
            verify(userRepository).save(any(User.class));
        }

        @Test
        @DisplayName("Should fail when email already exists")
        void shouldFailWhenEmailExists() {
            when(userRepository.existsByEmailAndActiveTrue("test@biblioteca.ah")).thenReturn(true);

            ResultDTO result = registrar();

            assertFalse(result.isCorrect());
            assertEquals(102, result.getErrorCode());
            verify(userRepository, never()).save(any(User.class));
        }

        @Test
        @DisplayName("Should fail when password is missing for new user")
        void shouldFailWhenPasswordMissing() {
            testSaveDTO.setPassword(null);

            ResultDTO result = registrar();

            assertFalse(result.isCorrect());
            assertEquals(101, result.getErrorCode());
        }

        @Test
        @DisplayName("Should fail when password is blank for new user")
        void shouldFailWhenPasswordBlank() {
            testSaveDTO.setPassword("   ");

            ResultDTO result = registrar();

            assertFalse(result.isCorrect());
            assertEquals(101, result.getErrorCode());
        }

        @Test
        @DisplayName("Should trim and save email with spaces correctly")
        void shouldCreateUserWithEmailContainingSpaces() {
            testSaveDTO.setEmail("  test@biblioteca.ah  ");
            when(userRepository.existsByEmailAndActiveTrue("  test@biblioteca.ah  ")).thenReturn(false);
            when(passwordEncoder.encode(anyString())).thenReturn("encoded");
            when(userRepository.save(any(User.class))).thenReturn(testUser);
            when(userMapper.toResultDTO(any(User.class))).thenReturn(testResultDTO);

            ResultDTO result = registrar();

            assertTrue(result.isCorrect());
            verify(userRepository).save(any(User.class));
        }
    }

    @Nested
    @DisplayName("saveAndUpdate - Update")
    class UpdateTests {

        @BeforeEach
        void setUp() {
            testSaveDTO.setId(1L);
        }

        @Test
        @DisplayName("Should update user successfully")
        void shouldUpdateUserSuccessfully() {
            testSaveDTO.setPassword(null);
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.existsByEmailAndActiveTrueAndIdNot("test@biblioteca.ah", 1L)).thenReturn(false);
            when(userRepository.save(any(User.class))).thenReturn(testUser);
            when(userMapper.toResultDTO(any(User.class))).thenReturn(testResultDTO);

            ResultDTO result = userService.saveAndUpdate(testSaveDTO);

            assertTrue(result.isCorrect());
            verify(userRepository).save(any(User.class));
        }

        @Test
        @DisplayName("Should fail when user not found")
        void shouldFailWhenUserNotFound() {
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.empty());

            ResultDTO result = userService.saveAndUpdate(testSaveDTO);

            assertFalse(result.isCorrect());
            assertEquals(103, result.getErrorCode());
        }

        @Test
        @DisplayName("Should fail when email taken by another user")
        void shouldFailWhenEmailTakenByAnother() {
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.existsByEmailAndActiveTrueAndIdNot("test@biblioteca.ah", 1L)).thenReturn(true);

            ResultDTO result = userService.saveAndUpdate(testSaveDTO);

            assertFalse(result.isCorrect());
            assertEquals(102, result.getErrorCode());
        }

        @Test
        @DisplayName("Should update without changing password when null")
        void shouldNotChangePasswordWhenNull() {
            testSaveDTO.setPassword(null);
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.existsByEmailAndActiveTrueAndIdNot(anyString(), anyLong())).thenReturn(false);
            when(userRepository.save(any(User.class))).thenReturn(testUser);
            when(userMapper.toResultDTO(any(User.class))).thenReturn(testResultDTO);

            userService.saveAndUpdate(testSaveDTO);

            verify(passwordEncoder, never()).encode(anyString());
        }

        @Test
        @DisplayName("Should update password when provided with the current one")
        void shouldUpdatePasswordWhenProvided() {
            testSaveDTO.setPassword("NewPass123!");
            testSaveDTO.setCurrentPassword("Password123!");
            when(passwordEncoder.matches("Password123!", "encoded-password")).thenReturn(true);
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.existsByEmailAndActiveTrueAndIdNot(anyString(), anyLong())).thenReturn(false);
            when(passwordEncoder.encode("NewPass123!")).thenReturn("new-encoded");
            when(userRepository.save(any(User.class))).thenReturn(testUser);
            when(userMapper.toResultDTO(any(User.class))).thenReturn(testResultDTO);

            userService.saveAndUpdate(testSaveDTO);

            verify(passwordEncoder).encode("NewPass123!");
        }

        @Test
        @DisplayName("sin la contrasena actual no se cambia la contrasena (QA A3)")
        void sinClaveActualNoCambia() {
            testSaveDTO.setPassword("NewPass123!");
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));

            ResultDTO result = userService.saveAndUpdate(testSaveDTO);

            assertFalse(result.isCorrect());
            assertEquals(400, result.getErrorCode());
            verify(passwordEncoder, never()).encode(anyString());
            verify(userRepository, never()).save(any(User.class));
        }

        @Test
        @DisplayName("con la contrasena actual equivocada tampoco")
        void claveActualEquivocada() {
            testSaveDTO.setPassword("NewPass123!");
            testSaveDTO.setCurrentPassword("adivinanza1");
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(passwordEncoder.matches("adivinanza1", "encoded-password")).thenReturn(false);

            ResultDTO result = userService.saveAndUpdate(testSaveDTO);

            assertFalse(result.isCorrect());
            assertEquals("La contraseña actual no es correcta", result.getMessage());
            verify(userRepository, never()).save(any(User.class));
        }

    }

    @Nested
    @DisplayName("getById")
    class GetByIdTests {

        @Test
        @DisplayName("Should return user when found")
        void shouldReturnUserWhenFound() {
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(userMapper.toResultDTO(testUser)).thenReturn(testResultDTO);

            ResultDTO result = userService.getById(1L);

            assertTrue(result.isCorrect());
            assertNotNull(result.getObject());
        }

        @Test
        @DisplayName("Should return error when not found")
        void shouldReturnErrorWhenNotFound() {
            /* Un id que no es el tuyo se rechaza SIN consultar la base. La
               respuesta es la misma que para un id inexistente —"no
               encontrado"— a proposito: distinguir "no existe" de "existe pero
               no es tuyo" permitiria averiguar cuantas cuentas hay probando
               numeros. Por eso aqui ya no hace falta simular el repositorio:
               no se llega a el. */
            ResultDTO result = userService.getById(99L);

            assertFalse(result.isCorrect());
            assertEquals(103, result.getErrorCode());
            verify(userRepository, never()).findByIdAndActiveTrue(99L);
        }
    }

    @Nested
    @DisplayName("getAll")
    class GetAllTests {

        /* /v1/users/all dejo de ser un directorio abierto: sin correo en el
           filtro te devuelve SOLO a ti, y con correo hace coincidencia exacta.
           Antes cualquier autenticado listaba a todos los usuarios de la
           plataforma con nombre y correo, y con un LIKE: buscar "a" los sacaba
           a todos. El unico uso legitimo —invitar al hogar por correo— sigue
           funcionando porque siempre pregunta por un correo concreto. */

        @Test
        @DisplayName("sin filtro de correo devuelve SOLO al usuario autenticado")
        void sinCorreoSoloDevuelveAlPropio() {
            UserFilterDTO filter = new UserFilterDTO();
            filter.setPage(0);
            filter.setSize(10);

            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(userMapper.toResultDTO(testUser)).thenReturn(testResultDTO);

            ResultDTO result = userService.getAll(filter);

            assertTrue(result.isCorrect());
            @SuppressWarnings("unchecked")
            Map<String, Object> response = (Map<String, Object>) result.getObject();
            assertEquals(1, ((List<?>) response.get("list")).size());
            verify(userRepository, never()).findAllWithFilters(any(), any(), any(Pageable.class));
        }

        @Test
        @DisplayName("sin sesion no devuelve a nadie")
        void sinSesionNoDevuelveNada() {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
            UserFilterDTO filter = new UserFilterDTO();

            ResultDTO result = userService.getAll(filter);

            assertTrue(result.isCorrect());
            @SuppressWarnings("unchecked")
            Map<String, Object> response = (Map<String, Object>) result.getObject();
            assertTrue(((List<?>) response.get("list")).isEmpty());
        }

        @Test
        @DisplayName("con correo hace coincidencia EXACTA, nunca parcial")
        void conCorreoCoincidenciaExacta() {
            UserFilterDTO filter = new UserFilterDTO();
            filter.setEmail("test@biblioteca.ah");
            filter.setPage(0);
            filter.setSize(10);

            when(userRepository.findByEmailAndActiveTrue("test@biblioteca.ah"))
                    .thenReturn(Optional.of(testUser));
            when(userMapper.toResultDTO(testUser)).thenReturn(testResultDTO);

            ResultDTO result = userService.getAll(filter);

            assertTrue(result.isCorrect());
            @SuppressWarnings("unchecked")
            Map<String, Object> response = (Map<String, Object>) result.getObject();
            assertEquals(1, ((List<?>) response.get("list")).size());
            /* La clave: se busca por igualdad, no con el LIKE de antes. */
            verify(userRepository).findByEmailAndActiveTrue("test@biblioteca.ah");
            verify(userRepository, never()).findAllWithFilters(any(), any(), any(Pageable.class));
        }

        @Test
        @DisplayName("un correo que no existe no devuelve nada")
        void correoInexistente() {
            UserFilterDTO filter = new UserFilterDTO();
            filter.setEmail("nadie@biblioteca.ah");

            when(userRepository.findByEmailAndActiveTrue("nadie@biblioteca.ah"))
                    .thenReturn(Optional.empty());

            ResultDTO result = userService.getAll(filter);

            assertTrue(result.isCorrect());
            @SuppressWarnings("unchecked")
            Map<String, Object> response = (Map<String, Object>) result.getObject();
            assertTrue(((List<?>) response.get("list")).isEmpty());
        }
    }

    @Nested
    @DisplayName("delete")
    class DeleteTests {

        @Test
        @DisplayName("Should soft delete user")
        void shouldSoftDeleteUser() {
            when(userRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.save(any(User.class))).thenReturn(testUser);

            ResultDTO result = userService.delete(1L);

            assertTrue(result.isCorrect());
            verify(userRepository).save(argThat(user -> !user.getActive()));
        }

        @Test
        @DisplayName("Should fail when user not found for deletion")
        void shouldFailWhenUserNotFoundForDeletion() {
            /* Igual que en getById: borrar una cuenta ajena se corta antes de
               tocar la base. Antes cualquier autenticado desactivaba la cuenta
               de otro con solo su id y el dueno se quedaba fuera sin saber por
               que. */
            ResultDTO result = userService.delete(99L);

            assertFalse(result.isCorrect());
            assertEquals(103, result.getErrorCode());
            verify(userRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("Error Handling")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Should handle exception in save gracefully")
        void shouldHandleExceptionInSave() {
            when(userRepository.existsByEmailAndActiveTrue(anyString()))
                    .thenThrow(new RuntimeException("DB error"));

            com.bibliotecaah.auth.dto.input.UserRegisterDTO alta = new com.bibliotecaah.auth.dto.input.UserRegisterDTO();
            alta.setName("Test User");
            alta.setEmail("test@biblioteca.ah");
            alta.setPassword("Password123!");
            ResultDTO result = userService.register(alta);
            assertFalse(result.isCorrect());
            assertEquals(500, result.getErrorCode());
        }
    }
}
