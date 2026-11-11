package com.bibliotecaah.auth.security;

import com.bibliotecaah.auth.entity.User;
import com.bibliotecaah.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MyUserDetailsServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private MyUserDetailsService myUserDetailsService;

    private User activeUser;

    @BeforeEach
    void setUp() {
        activeUser = User.builder()
                .id(1L)
                .name("Test User")
                .email("test@biblioteca.ah")
                .password("encoded-password")
                
                .active(true)
                .build();
    }

    @Nested
    @DisplayName("loadUserByUsername")
    class LoadUserByUsernameTests {

        @Test
        @DisplayName("Should return UserDetails for valid active user")
        void shouldReturnUserDetailsForValidActiveUser() {
            when(userRepository.findByEmailAndActiveTrue("test@biblioteca.ah"))
                    .thenReturn(Optional.of(activeUser));

            UserDetails userDetails = myUserDetailsService.loadUserByUsername("test@biblioteca.ah");

            assertNotNull(userDetails);
            assertEquals("test@biblioteca.ah", userDetails.getUsername());
            assertEquals("encoded-password", userDetails.getPassword());
            assertTrue(userDetails.isEnabled());
            assertTrue(userDetails.isAccountNonExpired());
            assertTrue(userDetails.isAccountNonLocked());
            assertTrue(userDetails.isCredentialsNonExpired());
            verify(userRepository).findByEmailAndActiveTrue("test@biblioteca.ah");
        }

        @Test
        @DisplayName("Should throw UsernameNotFoundException for non-existent email")
        void shouldThrowExceptionForNonExistentEmail() {
            when(userRepository.findByEmailAndActiveTrue("nonexistent@biblioteca.ah"))
                    .thenReturn(Optional.empty());

            UsernameNotFoundException exception = assertThrows(
                    UsernameNotFoundException.class,
                    () -> myUserDetailsService.loadUserByUsername("nonexistent@biblioteca.ah")
            );

            assertTrue(exception.getMessage().contains("nonexistent@biblioteca.ah"));
            verify(userRepository).findByEmailAndActiveTrue("nonexistent@biblioteca.ah");
        }

        @Test
        @DisplayName("Should throw UsernameNotFoundException for inactive user")
        void shouldThrowExceptionForInactiveUser() {
            // findByEmailAndActiveTrue returns empty for inactive users
            when(userRepository.findByEmailAndActiveTrue("inactive@biblioteca.ah"))
                    .thenReturn(Optional.empty());

            assertThrows(
                    UsernameNotFoundException.class,
                    () -> myUserDetailsService.loadUserByUsername("inactive@biblioteca.ah")
            );

            verify(userRepository).findByEmailAndActiveTrue("inactive@biblioteca.ah");
        }

        @Test
        @DisplayName("Should return UserDetails with correct email as username")
        void shouldReturnUserDetailsWithCorrectEmail() {
            when(userRepository.findByEmailAndActiveTrue("test@biblioteca.ah"))
                    .thenReturn(Optional.of(activeUser));

            UserDetails userDetails = myUserDetailsService.loadUserByUsername("test@biblioteca.ah");

            assertEquals(activeUser.getEmail(), userDetails.getUsername());
        }
    }
}
