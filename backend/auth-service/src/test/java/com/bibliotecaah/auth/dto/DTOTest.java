package com.bibliotecaah.auth.dto;

import com.bibliotecaah.auth.dto.input.*;
import com.bibliotecaah.auth.dto.output.*;
import com.bibliotecaah.auth.entity.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DTOTest {

    @Test
    @DisplayName("ResultDTO constructors work correctly")
    void testResultDTO() {
        ResultDTO success = new ResultDTO("data");
        assertTrue(success.isCorrect());
        assertEquals("OK", success.getMessage());
        assertEquals(0, success.getErrorCode());
        assertEquals("data", success.getObject());

        ResultDTO error = new ResultDTO(false, "error", 101);
        assertFalse(error.isCorrect());
        assertEquals("error", error.getMessage());
        assertEquals(101, error.getErrorCode());
        assertNull(error.getObject());

        ResultDTO full = new ResultDTO(false, "msg", 102, "obj");
        assertEquals("obj", full.getObject());

        // NoArgs + setters
        ResultDTO noArgs = new ResultDTO();
        noArgs.setCorrect(true);
        noArgs.setMessage("test");
        noArgs.setErrorCode(0);
        noArgs.setObject("data");
        assertTrue(noArgs.isCorrect());
        assertEquals("test", noArgs.getMessage());
        assertEquals(0, noArgs.getErrorCode());
        assertEquals("data", noArgs.getObject());
    }

    @Test
    @DisplayName("AuthenticationRequest getters/setters")
    void testAuthRequest() {
        AuthenticationRequest req = new AuthenticationRequest("a@b.com", "pass");
        assertEquals("a@b.com", req.getEmail());
        assertEquals("pass", req.getPassword());
    }

    @Test
    @DisplayName("AuthenticationResponse getters/setters")
    void testAuthResponse() {
        AuthenticationResponse res = new AuthenticationResponse("tok", "a@b.com", "Name", 1L, java.util.List.of("USER"));
        assertEquals("tok", res.getToken());
        assertEquals("a@b.com", res.getEmail());
        assertEquals("Name", res.getName());
        assertEquals(1L, res.getUserId());
    }

    @Test
    @DisplayName("UserSaveDTO getters/setters")
    void testUserSaveDTO() {
        UserSaveDTO dto = new UserSaveDTO(1L, "Name", "e@e.com", "pass", null);
        assertEquals(1L, dto.getId());
        assertEquals("Name", dto.getName());
        assertEquals("e@e.com", dto.getEmail());
        assertEquals("pass", dto.getPassword());
    }

    @Test
    @DisplayName("UserFilterDTO getters/setters")
    void testUserFilterDTO() {
        UserFilterDTO dto = new UserFilterDTO("name", "email", true, 1, 20);
        assertEquals("name", dto.getName());
        assertEquals("email", dto.getEmail());
        assertTrue(dto.getActive());
        assertEquals(1, dto.getPage());
        assertEquals(20, dto.getSize());
    }

    @Test
    @DisplayName("User entity builder and getters")
    void testUserEntity() {
        User user = User.builder()
                .id(1L).name("Test").email("t@t.com")
                .password("pass").active(true).build();
        assertEquals(1L, user.getId());
        assertEquals("Test", user.getName());
        assertEquals("t@t.com", user.getEmail());
        assertTrue(user.getActive());

        // NoArgs + setters + timestamp fields
        User noArgs = new User();
        noArgs.setId(2L);
        noArgs.setName("Name");
        noArgs.setEmail("n@n.com");
        noArgs.setPassword("pass");
        noArgs.setActive(false);
        noArgs.setCreatedAt(java.time.LocalDateTime.now());
        noArgs.setUpdatedAt(java.time.LocalDateTime.now());
        assertEquals(2L, noArgs.getId());
        assertEquals("Name", noArgs.getName());
        assertFalse(noArgs.getActive());
        assertNotNull(noArgs.getCreatedAt());
        assertNotNull(noArgs.getUpdatedAt());

        // AllArgs constructor
        User allArgs = new User(3L, "All", "a@a.com", "p", true, new java.util.HashSet<>(), null, null);
        assertEquals(3L, allArgs.getId());
        assertEquals("All", allArgs.getName());
    }

    @Test
    @DisplayName("ResultUserDTO getters/setters")
    void testResultUserDTO() {
        ResultUserDTO dto = new ResultUserDTO();
        dto.setId(1L);
        dto.setName("Test");
        dto.setEmail("t@t.com");
        dto.setActive(true);
        assertEquals(1L, dto.getId());
        assertEquals("Test", dto.getName());
    }
}
