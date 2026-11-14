package com.bibliotecaah.biblioteca.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

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
        /* Validacion web 0.4.0 (V-NUEVO-2): con HttpURLConnection (SimpleClientHttpRequestFactory) el
           cuerpo de un 401 se pierde, y hace falta para distinguir una revocacion del 401 «sin sesion»
           de auth y para dejarlo en el log. El HttpClient del JDK si lo entrega. HTTP/1.1: sin el
           intento de h2c contra Tomcat. */
        HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofMillis(timeout)).build();
        JdkClientHttpRequestFactory fabrica = new JdkClientHttpRequestFactory(http);
        fabrica.setReadTimeout(timeout);
        return RestClient.builder().baseUrl(url).requestFactory(fabrica).build();
    }
}
