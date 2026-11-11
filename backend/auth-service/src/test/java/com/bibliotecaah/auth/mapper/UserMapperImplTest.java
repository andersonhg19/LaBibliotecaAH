package com.bibliotecaah.auth.mapper;

import com.bibliotecaah.auth.dto.output.ResultUserDTO;
import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.mapper.impl.UserMapperImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.modelmapper.ModelMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserMapperImplTest {

    @Mock
    private ModelMapper modelMapper;

    @InjectMocks
    private UserMapperImpl userMapper;

    private User testUser;
    private ResultUserDTO testResultDTO;

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
    }

    @Nested
    @DisplayName("toResultDTO")
    class ToResultDTOTests {

        @Test
        @DisplayName("Should map valid user to ResultUserDTO correctly")
        void shouldMapValidUserToResultDTO() {
            when(modelMapper.map(testUser, ResultUserDTO.class)).thenReturn(testResultDTO);

            ResultUserDTO result = userMapper.toResultDTO(testUser);

            assertNotNull(result);
            assertEquals(1L, result.getId());
            assertEquals("Test User", result.getName());
            assertEquals("test@biblioteca.ah", result.getEmail());
            assertTrue(result.getActive());
            verify(modelMapper).map(testUser, ResultUserDTO.class);
        }

        @Test
        @DisplayName("Should return null when user is null")
        void shouldReturnNullWhenUserIsNull() {
            ResultUserDTO result = userMapper.toResultDTO(null);

            assertNull(result);
            verify(modelMapper, never()).map(any(), any(Class.class));
        }
    }

    @Nested
    @DisplayName("toEntity")
    class ToEntityTests {

        @Test
        @DisplayName("Should map valid DTO to User entity correctly")
        void shouldMapValidDTOToEntity() {
            when(modelMapper.map(testResultDTO, User.class)).thenReturn(testUser);

            User result = userMapper.toEntity(testResultDTO);

            assertNotNull(result);
            assertEquals(1L, result.getId());
            assertEquals("Test User", result.getName());
            assertEquals("test@biblioteca.ah", result.getEmail());
            verify(modelMapper).map(testResultDTO, User.class);
        }

        @Test
        @DisplayName("Should return null when DTO is null")
        void shouldReturnNullWhenDTOIsNull() {
            User result = userMapper.toEntity(null);

            assertNull(result);
            verify(modelMapper, never()).map(any(), any(Class.class));
        }
    }
}
