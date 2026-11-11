package com.bibliotecaah.auth.util;

import com.bibliotecaah.auth.dto.output.ResultDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ValidationUtilsTest {

    @Nested
    @DisplayName("error")
    class ErrorTests {

        @Test
        @DisplayName("Should create ResultDTO with correct fields")
        void shouldCreateResultDTOWithCorrectFields() {
            ResultDTO result = ValidationUtils.error("Something went wrong", 500);

            assertFalse(result.isCorrect());
            assertEquals("Something went wrong", result.getMessage());
            assertEquals(500, result.getErrorCode());
            assertNull(result.getObject());
        }

        @Test
        @DisplayName("Should create error with zero error code")
        void shouldCreateErrorWithZeroErrorCode() {
            ResultDTO result = ValidationUtils.error("Minor issue", 0);

            assertFalse(result.isCorrect());
            assertEquals(0, result.getErrorCode());
        }
    }

    @Nested
    @DisplayName("isBlank")
    class IsBlankTests {

        @Test
        @DisplayName("Should return true for null")
        void shouldReturnTrueForNull() {
            assertTrue(ValidationUtils.isBlank(null));
        }

        @Test
        @DisplayName("Should return true for empty string")
        void shouldReturnTrueForEmptyString() {
            assertTrue(ValidationUtils.isBlank(""));
        }

        @Test
        @DisplayName("Should return true for whitespace only")
        void shouldReturnTrueForWhitespaceOnly() {
            assertTrue(ValidationUtils.isBlank("   "));
        }

        @Test
        @DisplayName("Should return false for text with content")
        void shouldReturnFalseForTextWithContent() {
            assertFalse(ValidationUtils.isBlank("hello"));
        }

        @Test
        @DisplayName("Should return false for text with leading/trailing spaces")
        void shouldReturnFalseForTextWithSpaces() {
            assertFalse(ValidationUtils.isBlank("  hello  "));
        }
    }

}
