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

    /**
     * RestClient hacia el traductor autoalojado (contratos v1.3): 5 s de conexion y 60 s de
     * lectura, porque un lote de frases de un capitulo puede tardar decenas de segundos en CPU.
     */
    @Bean
    public RestClient clienteDelTraductor(@Value("${biblioteca.traductor.url:http://traductor:5000}") String url,
                                          @Value("${biblioteca.traductor.timeout-conexion-ms:5000}") int conexion,
                                          @Value("${biblioteca.traductor.timeout-lectura-ms:60000}") int lectura) {
        SimpleClientHttpRequestFactory fabrica = new SimpleClientHttpRequestFactory();
        fabrica.setConnectTimeout(conexion);
        fabrica.setReadTimeout(lectura);
        return RestClient.builder().baseUrl(url).requestFactory(fabrica).build();
    }

    /**
     * RestClient hacia auth-service para comprobar que una sesion sigue
     * vigente (QA SE-02). Timeouts cortos: va en el camino de cada peticion
     * (con cache) y, si auth no contesta pronto, se deja pasar con la firma.
     */
    @Bean
    public RestClient clienteDeAuth(@Value("${biblioteca.auth-url:http://auth-service:8921}") String url,
                                    @Value("${biblioteca.sesion.timeout-ms:2000}") int timeout) {
        SimpleClientHttpRequestFactory fabrica = new SimpleClientHttpRequestFactory();
        fabrica.setConnectTimeout(timeout);
        fabrica.setReadTimeout(timeout);
        return RestClient.builder().baseUrl(url).requestFactory(fabrica).build();
    }
}
