package com.bibliotecaah.biblioteca.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** RestClient hacia el taller con timeouts explicitos (5 s conexion / 30 s lectura). */
@Configuration
public class RestClientConfig {

    @Bean
    public RestClient clienteDelTaller(@Value("${biblioteca.taller-url}") String url,
                                       @Value("${biblioteca.timeout-conexion-ms:5000}") int conexion,
                                       @Value("${biblioteca.timeout-lectura-ms:30000}") int lectura) {
        SimpleClientHttpRequestFactory fabrica = new SimpleClientHttpRequestFactory();
        fabrica.setConnectTimeout(conexion);
        fabrica.setReadTimeout(lectura);
        return RestClient.builder().baseUrl(url).requestFactory(fabrica).build();
    }
}
