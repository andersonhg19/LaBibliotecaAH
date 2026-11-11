package com.bibliotecaah.auth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.bibliotecaah.auth.dto.input.UserFilterDTO;
import com.bibliotecaah.auth.dto.input.UserSaveDTO;
import com.bibliotecaah.auth.dto.output.ResultDTO;
import com.bibliotecaah.auth.dto.output.ResultUserDTO;
import com.bibliotecaah.auth.security.JWTAuthorizationFilter;
import com.bibliotecaah.auth.security.SecParams;
import com.bibliotecaah.auth.service.UserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserController.class)
@AutoConfigureMockMvc(addFilters = false)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @MockBean
    private JWTAuthorizationFilter jwtAuthorizationFilter;

    @MockBean
    private SecParams secParams;

    @Test
    @DisplayName("POST /v1/users/save - Should save user")
    void saveUser() throws Exception {
        UserSaveDTO dto = new UserSaveDTO();
        dto.setName("Test User");
        dto.setEmail("test@biblioteca.ah");
        dto.setPassword("Password123!");

        ResultUserDTO resultUser = new ResultUserDTO();
        resultUser.setId(1L);
        resultUser.setName("Test User");

        when(userService.saveAndUpdate(any())).thenReturn(new ResultDTO(resultUser));

        mockMvc.perform(post("/v1/users/save")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.object.name").value("Test User"));
    }

    @Test
    @DisplayName("POST /v1/users/get/{id} - Should return user by id")
    void getUserById() throws Exception {
        ResultUserDTO resultUser = new ResultUserDTO();
        resultUser.setId(1L);
        resultUser.setName("Test User");

        when(userService.getById(1L)).thenReturn(new ResultDTO(resultUser));

        mockMvc.perform(post("/v1/users/get/1")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.object.id").value(1));
    }

    @Test
    @DisplayName("POST /v1/users/all - Should return paginated users")
    void getAllUsers() throws Exception {
        UserFilterDTO filter = new UserFilterDTO();

        Map<String, Object> pageResponse = Map.of(
                "page", 0, "size", 10, "totalPage", 1,
                "totalElements", 1L, "list", List.of(new ResultUserDTO()));

        when(userService.getAll(any())).thenReturn(new ResultDTO(pageResponse));

        mockMvc.perform(post("/v1/users/all")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(filter)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.object.page").value(0));
    }

    @Test
    @DisplayName("POST /v1/users/delete/{id} - Should soft delete user")
    void deleteUser() throws Exception {
        when(userService.delete(1L)).thenReturn(new ResultDTO(true, "User deleted successfully", 0));

        mockMvc.perform(post("/v1/users/delete/1")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true));
    }

    @Test
    @DisplayName("POST /v1/users/save - Should return error on duplicate email")
    void saveUserDuplicateEmail() throws Exception {
        UserSaveDTO dto = new UserSaveDTO();
        dto.setName("Test User");
        dto.setEmail("existing@biblioteca.ah");
        dto.setPassword("Password123!");

        when(userService.saveAndUpdate(any())).thenReturn(new ResultDTO(false, "Email already in use", 102));

        mockMvc.perform(post("/v1/users/save")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(102));
    }

    @Test
    @DisplayName("POST /v1/users/get/{id} - Should return error when not found")
    void getUserByIdNotFound() throws Exception {
        when(userService.getById(99L)).thenReturn(new ResultDTO(false, "User not found", 103));

        mockMvc.perform(post("/v1/users/get/99")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.errorCode").value(103));
    }

    /* Exigia un 400 de Spring: certificaba justo lo que rompe al frontend, que
       solo sabe leer ResultDTO con HTTP 200. Ahora se exige 200, correct:false
       y el nombre del campo malo. */
    @Test
    @DisplayName("POST /v1/users/save - sin correo: 200 con correct:false y el campo que falla")
    void saveUserMissingEmail() throws Exception {
        UserSaveDTO dto = new UserSaveDTO();
        dto.setName("Test User");
        dto.setPassword("Password123!");
        // email is null -> @NotBlank should fail

        mockMvc.perform(post("/v1/users/save")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("'email'")));
    }

    @Test
    @DisplayName("POST /v1/users/all - Should return paginated structure")
    void getAllReturnsPaginatedStructure() throws Exception {
        UserFilterDTO filter = new UserFilterDTO();

        ResultUserDTO resultUser = new ResultUserDTO();
        resultUser.setId(1L);
        resultUser.setName("Test User");
        resultUser.setEmail("test@biblioteca.ah");

        Map<String, Object> pageResponse = Map.of(
                "page", 0, "size", 10, "totalPage", 1,
                "totalElements", 1L, "list", List.of(resultUser));

        when(userService.getAll(any())).thenReturn(new ResultDTO(pageResponse));

        mockMvc.perform(post("/v1/users/all")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(filter)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.object.page").value(0))
                .andExpect(jsonPath("$.object.size").value(10))
                .andExpect(jsonPath("$.object.totalPage").value(1))
                .andExpect(jsonPath("$.object.totalElements").value(1))
                .andExpect(jsonPath("$.object.list").isArray())
                .andExpect(jsonPath("$.object.list[0].name").value("Test User"));
    }
}
