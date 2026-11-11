package com.bibliotecaah.biblioteca.dto.output;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PageDTO<T> {
    private int page;
    private int size;
    private int totalPage;
    private long totalElements;
    private List<T> list;
}
