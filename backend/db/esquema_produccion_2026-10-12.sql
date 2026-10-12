--
-- PostgreSQL database dump
--

\restrict rAp2HXnGwkK925DJ3BdboHBJWX5VlDHJHWfYLLk5ShOh4GbWHxk4zCP2ZfQVshZ

-- Dumped from database version 14.24 (Ubuntu 14.24-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.24 (Ubuntu 14.24-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: topology; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA topology;


--
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA topology IS 'PostGIS Topology schema';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_topology IS 'PostGIS topology spatial types and functions';


--
-- Name: actualizar_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_up_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_up_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_permisos (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    vista character varying(60) NOT NULL,
    sub_accion character varying(40) NOT NULL,
    habilitado boolean DEFAULT false NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_permisos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_permisos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_permisos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_permisos_id_seq OWNED BY public.admin_permisos.id;


--
-- Name: alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertas (
    id integer NOT NULL,
    producer_id bigint,
    up_id bigint NOT NULL,
    ciclo_id bigint NOT NULL,
    tipo_alerta character varying(30) NOT NULL,
    origen_alerta character varying(20) NOT NULL,
    fecha_alerta date NOT NULL,
    nivel_alerta character varying(10) NOT NULL,
    estado_alerta character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    observaciones text,
    usuario_registro integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    cycle_crop_id bigint,
    CONSTRAINT chk_estado_alerta CHECK (((estado_alerta)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('confirmada'::character varying)::text, ('descartada'::character varying)::text, ('atendida'::character varying)::text]))),
    CONSTRAINT chk_nivel_alerta CHECK (((nivel_alerta)::text = ANY (ARRAY[('bajo'::character varying)::text, ('medio'::character varying)::text, ('alto'::character varying)::text]))),
    CONSTRAINT chk_origen_alerta CHECK (((origen_alerta)::text = ANY (ARRAY[('automatica'::character varying)::text, ('manual'::character varying)::text]))),
    CONSTRAINT chk_tipo_alerta CHECK (((tipo_alerta)::text = ANY (ARRAY[('helada'::character varying)::text, ('sequia'::character varying)::text, ('lluvia_fuerte'::character varying)::text, ('viento_fuerte'::character varying)::text, ('otro'::character varying)::text])))
);


--
-- Name: alertas_externas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertas_externas (
    id integer NOT NULL,
    tipo_alerta character varying(20) NOT NULL,
    subtipo character varying(100) NOT NULL,
    nivel_riesgo character varying(10) NOT NULL,
    descripcion text NOT NULL,
    recomendacion text,
    cultivo_afectado character varying(50) DEFAULT 'todos'::character varying,
    coordenada public.geography(Point,4326),
    radio_km integer DEFAULT 30 NOT NULL,
    estado character varying(100),
    municipio character varying(100),
    fecha_deteccion date NOT NULL,
    fecha_vigencia date,
    fuente character varying(50) NOT NULL,
    id_alerta_origen character varying(100),
    activa boolean DEFAULT true,
    importado_en timestamp without time zone DEFAULT now()
);


--
-- Name: alertas_externas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alertas_externas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alertas_externas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alertas_externas_id_seq OWNED BY public.alertas_externas.id;


--
-- Name: alertas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alertas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alertas_id_seq OWNED BY public.alertas.id;


--
-- Name: alertas_up; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertas_up (
    alerta_id integer NOT NULL,
    up_id integer NOT NULL,
    distancia_km numeric(8,2),
    notificado boolean DEFAULT false,
    calculado_en timestamp without time zone DEFAULT now()
);


--
-- Name: apoyos_ventanilla; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apoyos_ventanilla (
    id integer NOT NULL,
    ventanilla_id integer NOT NULL,
    nombre_apoyo character varying(50),
    descripcion text,
    requisitos text,
    disponible boolean DEFAULT true,
    cupo_disponible integer,
    vigencia_fin date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT apoyos_ventanilla_nombre_apoyo_check CHECK (((nombre_apoyo)::text = ANY (ARRAY[('coberturas'::character varying)::text, ('incentivos'::character varying)::text])))
);


--
-- Name: apoyos_ventanilla_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.apoyos_ventanilla_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: apoyos_ventanilla_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.apoyos_ventanilla_id_seq OWNED BY public.apoyos_ventanilla.id;


--
-- Name: bodegas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bodegas (
    id integer NOT NULL,
    clave character varying(50),
    nombre character varying(500) NOT NULL,
    estado character varying(100),
    municipio character varying(100),
    region_id integer,
    ddr character varying(100),
    cader character varying(100),
    ejido character varying(200),
    direccion character varying(500),
    localidad character varying(300),
    codigo_postal character varying(10),
    latitud double precision NOT NULL,
    longitud double precision NOT NULL,
    capacidad_toneladas double precision DEFAULT 0,
    cvegeo character varying(10),
    cve_ent character varying(5),
    cve_mun character varying(5),
    fecha_actualizacion timestamp without time zone DEFAULT now(),
    activo boolean DEFAULT true,
    estatus character varying(20) DEFAULT 'aprobada'::character varying,
    creado_por integer,
    aprobado_por integer,
    fecha_aprobacion timestamp with time zone,
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    capacidad_ton double precision DEFAULT 0,
    es_ventanilla boolean DEFAULT false,
    realiza_acopio boolean DEFAULT false,
    opera_incentivos boolean DEFAULT false,
    opera_coberturas boolean DEFAULT false,
    registra_inventario boolean DEFAULT true,
    estatus_operativo character varying(20) DEFAULT 'activa'::character varying,
    semaforo_compra character varying(20) DEFAULT 'sin_actividad'::character varying,
    semaforo_updated_at timestamp without time zone,
    semaforo_usuario_id integer,
    horario character varying(200),
    telefono_contacto character varying(40),
    observaciones text,
    CONSTRAINT bodegas_semaforo_compra_check CHECK (((semaforo_compra)::text = ANY (ARRAY[('sin_actividad'::character varying)::text, ('verde'::character varying)::text, ('amarillo'::character varying)::text, ('rojo'::character varying)::text])))
);


--
-- Name: bodegas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bodegas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bodegas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bodegas_id_seq OWNED BY public.bodegas.id;


--
-- Name: bodeguero_bodegas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bodeguero_bodegas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    bodega_id integer NOT NULL,
    estatus character varying(20) DEFAULT 'aprobada'::character varying,
    fecha_solicitud timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    aprobado_por integer,
    fecha_aprobacion timestamp without time zone,
    CONSTRAINT bodeguero_bodegas_estatus_check CHECK (((estatus)::text = ANY (ARRAY[('aprobada'::character varying)::text, ('pendiente'::character varying)::text, ('rechazada'::character varying)::text])))
);


--
-- Name: bodeguero_bodegas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bodeguero_bodegas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bodeguero_bodegas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bodeguero_bodegas_id_seq OWNED BY public.bodeguero_bodegas.id;


--
-- Name: cat_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_catalog (
    id integer NOT NULL,
    catalog character varying(50) NOT NULL,
    code character varying(40) NOT NULL,
    label character varying(100) NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true
);


--
-- Name: cat_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_catalog_id_seq OWNED BY public.cat_catalog.id;


--
-- Name: cat_conceptos_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_conceptos_servicio (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    icono character varying(50),
    unidad_default character varying(20) DEFAULT 'MXN/ton'::character varying,
    estatus character varying(20) DEFAULT 'aprobado'::character varying,
    propuesto_por integer,
    CONSTRAINT cat_conceptos_servicio_estatus_check CHECK (((estatus)::text = ANY (ARRAY[('aprobado'::character varying)::text, ('pendiente'::character varying)::text]))),
    CONSTRAINT cat_conceptos_servicio_unidad_default_check CHECK (((unidad_default)::text = ANY (ARRAY[('MXN/ton'::character varying)::text, ('MXN/ton/mes'::character varying)::text, ('MXN/viaje'::character varying)::text])))
);


--
-- Name: cat_conceptos_servicio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_conceptos_servicio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_conceptos_servicio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_conceptos_servicio_id_seq OWNED BY public.cat_conceptos_servicio.id;


--
-- Name: cat_crop_variety; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_crop_variety (
    id integer NOT NULL,
    crop character varying(10) NOT NULL,
    code character varying(40) NOT NULL,
    label character varying(100) NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    tipo_maiz character varying(20)
);


--
-- Name: cat_crop_variety_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_crop_variety_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_crop_variety_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_crop_variety_id_seq OWNED BY public.cat_crop_variety.id;


--
-- Name: cat_programas_gobierno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cat_programas_gobierno (
    id integer NOT NULL,
    clave character varying(50) NOT NULL,
    nombre character varying(200) NOT NULL,
    activo boolean DEFAULT true
);


--
-- Name: cat_programas_gobierno_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cat_programas_gobierno_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cat_programas_gobierno_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cat_programas_gobierno_id_seq OWNED BY public.cat_programas_gobierno.id;


--
-- Name: chat_conversaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_conversaciones (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    rol_usuario character varying(20) NOT NULL,
    estatus character varying(20) DEFAULT 'abierta'::character varying NOT NULL,
    no_leidos_admin integer DEFAULT 0 NOT NULL,
    no_leidos_usuario integer DEFAULT 0 NOT NULL,
    ultimo_mensaje_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    usuario_leido_hasta timestamp with time zone,
    admin_leido_hasta timestamp with time zone,
    bot_activo boolean DEFAULT true NOT NULL
);


--
-- Name: chat_conversaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_conversaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_conversaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_conversaciones_id_seq OWNED BY public.chat_conversaciones.id;


--
-- Name: chat_mensajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_mensajes (
    id integer NOT NULL,
    conversacion_id integer NOT NULL,
    autor_id integer NOT NULL,
    autor_rol character varying(20) NOT NULL,
    tipo character varying(20) DEFAULT 'texto'::character varying NOT NULL,
    contenido text,
    archivo_url text,
    archivo_mime character varying(100),
    archivo_nombre character varying(255),
    lat numeric(10,7),
    lng numeric(10,7),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activo_hasta timestamp with time zone
);


--
-- Name: chat_mensajes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_mensajes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_mensajes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_mensajes_id_seq OWNED BY public.chat_mensajes.id;


--
-- Name: cosecha_real; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cosecha_real (
    id integer NOT NULL,
    producer_id bigint NOT NULL,
    up_id bigint NOT NULL,
    ciclo_id bigint NOT NULL,
    fecha_cosecha date NOT NULL,
    superficie_cosechada_ha double precision NOT NULL,
    produccion_total_ton double precision NOT NULL,
    rendimiento_real_ton_ha double precision,
    observaciones text,
    usuario_captura integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    cycle_crop_id bigint,
    CONSTRAINT chk_cosecha_positivos CHECK (((superficie_cosechada_ha > (0)::double precision) AND (produccion_total_ton > (0)::double precision)))
);


--
-- Name: cosecha_real_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cosecha_real_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cosecha_real_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cosecha_real_id_seq OWNED BY public.cosecha_real.id;


--
-- Name: costos_fira; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.costos_fira (
    id integer NOT NULL,
    estado character varying(100) NOT NULL,
    modalidad character varying(10) NOT NULL,
    ciclo character varying(10) NOT NULL,
    costo_por_ha numeric(10,2) NOT NULL,
    precio_fira numeric(10,2) NOT NULL,
    pct_ganancia numeric(6,4) NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    activo boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: costos_fira_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.costos_fira_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: costos_fira_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.costos_fira_id_seq OWNED BY public.costos_fira.id;


--
-- Name: cycle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cycle (
    cycle_id bigint NOT NULL,
    up_id bigint NOT NULL,
    cycle_year integer NOT NULL,
    cycle_type character varying(10) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    declarado_por_productor boolean DEFAULT false,
    hectareas_sembradas numeric(10,2),
    fecha_siembra date,
    variedad_nombre text,
    estado_ciclo character varying(20) DEFAULT 'activo'::character varying,
    fecha_cosecha_real date,
    produccion_real_ton numeric(10,2),
    observaciones_cosecha text,
    tipo_riego character varying(20) DEFAULT 'temporal'::character varying,
    CONSTRAINT cycle_tipo_riego_check CHECK (((tipo_riego)::text = ANY (ARRAY[('temporal'::character varying)::text, ('riego'::character varying)::text])))
);


--
-- Name: cycle_crop_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cycle_crop_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cycle_crop; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cycle_crop (
    cycle_crop_id bigint DEFAULT nextval('public.cycle_crop_id_seq'::regclass) NOT NULL,
    cycle_id bigint NOT NULL,
    crop character varying(10) NOT NULL,
    variety_id character varying(40) NOT NULL,
    variety_other character varying(80),
    area_sown_ha numeric NOT NULL,
    area_harvested_ha numeric,
    destination character varying(20),
    production_qty numeric,
    production_unit character varying(10),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    planting_date date,
    estimated_harvest_date date,
    yield_expected numeric,
    tipo_maiz character varying(20),
    ventana_venta character varying(20) DEFAULT 'esta_semana'::character varying,
    disponible_para_venta boolean DEFAULT false,
    fecha_disponibilidad date,
    CONSTRAINT cycle_crop_area_harvested_ha_check CHECK ((area_harvested_ha >= (0)::numeric)),
    CONSTRAINT cycle_crop_area_sown_ha_check CHECK ((area_sown_ha > (0)::numeric)),
    CONSTRAINT cycle_crop_production_qty_check CHECK ((production_qty >= (0)::numeric)),
    CONSTRAINT cycle_crop_tipo_maiz_check CHECK (((tipo_maiz IS NULL) OR ((tipo_maiz)::text = ANY (ARRAY[('blanco'::character varying)::text, ('amarillo'::character varying)::text, ('criollo'::character varying)::text])))),
    CONSTRAINT cycle_crop_ventana_venta_check CHECK (((ventana_venta IS NULL) OR ((ventana_venta)::text = ANY (ARRAY[('esta_semana'::character varying)::text, ('quincena'::character varying)::text, ('mes'::character varying)::text]))))
);


--
-- Name: cycle_crop_cycle_crop_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cycle_crop_cycle_crop_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cycle_crop_cycle_crop_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cycle_crop_cycle_crop_id_seq OWNED BY public.cycle_crop.cycle_crop_id;


--
-- Name: cycle_cycle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cycle_cycle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cycle_cycle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cycle_cycle_id_seq OWNED BY public.cycle.cycle_id;


--
-- Name: discrepancias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discrepancias (
    id integer NOT NULL,
    tipo character varying(80) NOT NULL,
    prioridad character varying(10) NOT NULL,
    descripcion text,
    accion character varying(40),
    estado character varying(20) DEFAULT 'pendiente'::character varying,
    datos jsonb,
    creado_at timestamp without time zone DEFAULT now(),
    resuelto_at timestamp without time zone,
    resuelto_por integer,
    CONSTRAINT discrepancias_prioridad_check CHECK (((prioridad)::text = ANY (ARRAY[('ALTA'::character varying)::text, ('MEDIA'::character varying)::text, ('BAJA'::character varying)::text])))
);


--
-- Name: discrepancias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discrepancias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discrepancias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discrepancias_id_seq OWNED BY public.discrepancias.id;


--
-- Name: disponibilidad_productor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disponibilidad_productor (
    id integer NOT NULL,
    producer_id bigint NOT NULL,
    up_id bigint NOT NULL,
    tipo_maiz character varying(20) NOT NULL,
    variedad_code character varying(40),
    volumen_estimado_ton numeric(10,2),
    ventana_venta character varying(20) DEFAULT 'esta_semana'::character varying NOT NULL,
    fecha_disponible date DEFAULT CURRENT_DATE NOT NULL,
    fecha_vencimiento date NOT NULL,
    activa boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    variedad_libre text,
    ciclo_id bigint,
    precio_minimo_ton numeric(10,2),
    humedad_pct numeric(4,1),
    impurezas_pct numeric(4,1),
    grano_quebrado_pct numeric(4,1)
);


--
-- Name: COLUMN disponibilidad_productor.variedad_libre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.disponibilidad_productor.variedad_libre IS 'Texto libre cuando el productor selecciona variedad Otra';


--
-- Name: COLUMN disponibilidad_productor.ciclo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.disponibilidad_productor.ciclo_id IS 'Ciclo productivo del que proviene el maíz ofertado';


--
-- Name: disponibilidad_productor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.disponibilidad_productor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disponibilidad_productor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.disponibilidad_productor_id_seq OWNED BY public.disponibilidad_productor.id;


--
-- Name: encuesta_alias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_alias (
    id integer NOT NULL,
    texto_busqueda character varying(160) NOT NULL,
    producto_id character varying(15) NOT NULL
);


--
-- Name: encuesta_alias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.encuesta_alias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: encuesta_alias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.encuesta_alias_id_seq OWNED BY public.encuesta_alias.id;


--
-- Name: encuesta_categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_categorias (
    id character varying(10) NOT NULL,
    nombre character varying(120) NOT NULL,
    ayuda text
);


--
-- Name: encuesta_contexto_territorial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_contexto_territorial (
    id integer NOT NULL,
    respuesta_id integer NOT NULL,
    up_id integer NOT NULL,
    municipality_id character varying(5),
    municipality_name character varying(120)
);


--
-- Name: encuesta_contexto_territorial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.encuesta_contexto_territorial_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: encuesta_contexto_territorial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.encuesta_contexto_territorial_id_seq OWNED BY public.encuesta_contexto_territorial.id;


--
-- Name: encuesta_ediciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_ediciones (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    horizonte_meses integer DEFAULT 6 NOT NULL,
    version_catalogo character varying(10) NOT NULL,
    habilitada boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: encuesta_ediciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.encuesta_ediciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: encuesta_ediciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.encuesta_ediciones_id_seq OWNED BY public.encuesta_ediciones.id;


--
-- Name: encuesta_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_lineas (
    id integer NOT NULL,
    respuesta_id integer NOT NULL,
    producto_id character varying(15),
    producto_nombre_otro character varying(160),
    presentacion_id character varying(15),
    presentacion_otro_envase character varying(60),
    presentacion_otro_contenido numeric(12,4),
    presentacion_otro_unidad character varying(10),
    a_granel boolean DEFAULT false NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    mes_compra date NOT NULL,
    nombre_conocido character varying(160),
    preferencia_marca character varying(120),
    identificacion_pendiente boolean DEFAULT false NOT NULL,
    cantidad_base numeric(14,4),
    unidad_base character varying(10),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT encuesta_lineas_cantidad_check CHECK ((cantidad > (0)::numeric))
);


--
-- Name: encuesta_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.encuesta_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: encuesta_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.encuesta_lineas_id_seq OWNED BY public.encuesta_lineas.id;


--
-- Name: encuesta_presentaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_presentaciones (
    id character varying(15) NOT NULL,
    producto_id character varying(15) NOT NULL,
    envase character varying(60) NOT NULL,
    contenido numeric(12,4) NOT NULL,
    unidad character varying(10) NOT NULL,
    nombre_origen character varying(160),
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT encuesta_presentaciones_contenido_check CHECK ((contenido > (0)::numeric))
);


--
-- Name: encuesta_productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_productos (
    id character varying(15) NOT NULL,
    categoria_id character varying(10) NOT NULL,
    nombre_visible character varying(160) NOT NULL,
    requiere_nombre_conocido boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    version_catalogo character varying(10) NOT NULL,
    formula_referencia character varying(40),
    es_otro boolean DEFAULT false NOT NULL,
    clasificacion_interna text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: encuesta_respuestas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuesta_respuestas (
    id integer NOT NULL,
    producer_id integer NOT NULL,
    edicion_id integer NOT NULL,
    respuesta character varying(3) NOT NULL,
    periodo_inicio date NOT NULL,
    periodo_fin date NOT NULL,
    version_catalogo character varying(10) NOT NULL,
    canal character varying(20) DEFAULT 'productor'::character varying NOT NULL,
    capturista_id integer,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT encuesta_respuestas_canal_check CHECK (((canal)::text = ANY (ARRAY[('productor'::character varying)::text, ('tecnico'::character varying)::text]))),
    CONSTRAINT encuesta_respuestas_respuesta_check CHECK (((respuesta)::text = ANY (ARRAY[('si'::character varying)::text, ('no'::character varying)::text])))
);


--
-- Name: encuesta_respuestas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.encuesta_respuestas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: encuesta_respuestas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.encuesta_respuestas_id_seq OWNED BY public.encuesta_respuestas.id;


--
-- Name: estimacion_cosecha; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimacion_cosecha (
    id integer NOT NULL,
    producer_id bigint NOT NULL,
    up_id bigint NOT NULL,
    ciclo_id bigint NOT NULL,
    fecha_estimacion date NOT NULL,
    rendimiento_estimado_ton_ha double precision NOT NULL,
    produccion_estimada_ton double precision,
    observaciones text,
    usuario_captura integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    cycle_crop_id bigint,
    CONSTRAINT chk_rendimiento_estimado CHECK ((rendimiento_estimado_ton_ha > (0)::double precision))
);


--
-- Name: estimacion_cosecha_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estimacion_cosecha_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estimacion_cosecha_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estimacion_cosecha_id_seq OWNED BY public.estimacion_cosecha.id;


--
-- Name: filtros_guardados_bodega; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filtros_guardados_bodega (
    id integer NOT NULL,
    bodega_id integer NOT NULL,
    usuario_id integer NOT NULL,
    nombre character varying(80),
    tipo_maiz character varying(20),
    volumen_min_ton numeric(10,2),
    radio_km numeric(6,1) DEFAULT 100 NOT NULL,
    humedad_max_pct numeric(4,1),
    impurezas_max_pct numeric(4,1),
    grano_quebrado_max_pct numeric(4,1),
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: filtros_guardados_bodega_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.filtros_guardados_bodega_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: filtros_guardados_bodega_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.filtros_guardados_bodega_id_seq OWNED BY public.filtros_guardados_bodega.id;


--
-- Name: geo_municipality; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_municipality (
    municipality_id character varying(5) NOT NULL,
    state_id character varying(2) NOT NULL,
    name character varying(150) NOT NULL
);


--
-- Name: geo_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_state (
    state_id character varying(2) NOT NULL,
    name character varying(100) NOT NULL
);


--
-- Name: infraestructura_contactos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infraestructura_contactos (
    id integer NOT NULL,
    bodega_id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    cargo character varying(150),
    telefono character varying(20),
    correo character varying(255),
    es_principal boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: infraestructura_contactos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.infraestructura_contactos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: infraestructura_contactos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.infraestructura_contactos_id_seq OWNED BY public.infraestructura_contactos.id;


--
-- Name: inventarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventarios (
    id integer NOT NULL,
    bodega_id integer NOT NULL,
    usuario_id integer NOT NULL,
    ciclo character varying(30) NOT NULL,
    volumen_almacenamiento double precision NOT NULL,
    volumen_problemas double precision DEFAULT 0,
    fecha_registro timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    tipo_maiz character varying(50) DEFAULT 'Maiz blanco'::character varying,
    origen character varying(20) DEFAULT 'Local'::character varying,
    fecha date,
    observaciones text,
    volumen_problema double precision DEFAULT 0,
    variedad_code character varying(40),
    humedad_pct numeric(5,2),
    calidad character varying(10),
    CONSTRAINT inventarios_calidad_check CHECK (((calidad)::text = ANY (ARRAY[('primera'::character varying)::text, ('segunda'::character varying)::text])))
);


--
-- Name: inventarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventarios_id_seq OWNED BY public.inventarios.id;


--
-- Name: municipios_referencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.municipios_referencia (
    cve_geo character varying(10) NOT NULL,
    nombre character varying(200) NOT NULL,
    estado character varying(100) NOT NULL,
    centroid public.geography(Point,4326)
);


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id integer NOT NULL,
    alerta_id integer,
    usuario_id integer NOT NULL,
    leida boolean DEFAULT false,
    fecha_leida timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    tipo character varying(50),
    mensaje text,
    referencia_id integer,
    referencia_tipo character varying(50),
    titulo character varying(255),
    datos_extra jsonb,
    alerta_externa_id integer
);


--
-- Name: notificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificaciones_id_seq OWNED BY public.notificaciones.id;


--
-- Name: oferta_interes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oferta_interes (
    id bigint NOT NULL,
    usuario_id integer NOT NULL,
    bodega_id integer,
    municipio character varying(150) NOT NULL,
    estado character varying(100),
    tipo_maiz character varying(30),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: oferta_interes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oferta_interes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oferta_interes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oferta_interes_id_seq OWNED BY public.oferta_interes.id;


--
-- Name: ofertas_bodega; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ofertas_bodega (
    id integer NOT NULL,
    propuesta_id integer NOT NULL,
    bodega_id integer NOT NULL,
    usuario_id integer NOT NULL,
    precio_ofrecido_ton numeric(10,2) NOT NULL,
    costo_acondicionamiento_ton numeric(10,2) DEFAULT 0,
    modalidad_transporte character varying(20),
    costo_transporte_ton numeric(10,2) DEFAULT 0,
    pago_final_estimado_ton numeric(10,2) NOT NULL,
    momento_pago character varying(20),
    estatus character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ofertas_bodega_estatus_check CHECK (((estatus)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('aceptada'::character varying)::text, ('rechazada'::character varying)::text, ('retirada'::character varying)::text]))),
    CONSTRAINT ofertas_bodega_modalidad_transporte_check CHECK (((modalidad_transporte)::text = ANY (ARRAY[('bodega_recoge'::character varying)::text, ('productor_entrega'::character varying)::text]))),
    CONSTRAINT ofertas_bodega_precio_ofrecido_ton_check CHECK ((precio_ofrecido_ton >= (0)::numeric))
);


--
-- Name: ofertas_bodega_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ofertas_bodega_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ofertas_bodega_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ofertas_bodega_id_seq OWNED BY public.ofertas_bodega.id;


--
-- Name: precio_parametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precio_parametros (
    id integer NOT NULL,
    margen_pct numeric(5,2) DEFAULT 10.0,
    ventana_dias integer DEFAULT 7,
    min_txns integer DEFAULT 10,
    harineras_n integer DEFAULT 3,
    servicios_default numeric(10,2) DEFAULT 980.0,
    flete_default numeric(10,2) DEFAULT 1058.0,
    costo_fira numeric(10,2) DEFAULT 5466.0,
    precio_garantia_sader numeric(10,2) DEFAULT 6200.0,
    actualizado_por integer,
    actualizado_at timestamp without time zone DEFAULT now(),
    alerta_umbral_pct numeric(5,2) DEFAULT 5
);


--
-- Name: precio_parametros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.precio_parametros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: precio_parametros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.precio_parametros_id_seq OWNED BY public.precio_parametros.id;


--
-- Name: precio_referencias_externas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precio_referencias_externas (
    id integer NOT NULL,
    chicago_usd_bushel numeric(10,4),
    chicago_usd_ton numeric(10,2),
    chicago_mxn numeric(10,2),
    tc_banxico numeric(10,4),
    garantia_sader numeric(10,2) DEFAULT 6915.00,
    fuente character varying(50) DEFAULT 'cron'::character varying,
    error boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: precio_referencias_externas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.precio_referencias_externas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: precio_referencias_externas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.precio_referencias_externas_id_seq OWNED BY public.precio_referencias_externas.id;


--
-- Name: precios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precios (
    id integer NOT NULL,
    tipo_precio character varying(30) NOT NULL,
    fuente character varying(30) NOT NULL,
    precio double precision NOT NULL,
    tipo_maiz character varying(50) NOT NULL,
    fecha date NOT NULL,
    observaciones text,
    bodega_id integer,
    visita_id integer,
    producer_id bigint,
    up_id bigint,
    ciclo_id bigint,
    usuario_captura integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    estado text,
    municipio text,
    valor_origen numeric(12,4),
    unidad_origen text,
    tipo_cambio numeric(10,4),
    programa text,
    variedad_code character varying(40),
    humedad_pct numeric(5,2),
    calidad character varying(10),
    CONSTRAINT chk_precio_positivo CHECK ((precio > (0)::double precision)),
    CONSTRAINT precios_calidad_check CHECK (((calidad)::text = ANY (ARRAY[('primera'::character varying)::text, ('segunda'::character varying)::text])))
);


--
-- Name: precios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.precios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: precios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.precios_id_seq OWNED BY public.precios.id;


--
-- Name: precios_maiz; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precios_maiz (
    id integer NOT NULL,
    tipo character varying(50) NOT NULL,
    precio double precision NOT NULL,
    unidad character varying(20) DEFAULT 'MXN/ton'::character varying,
    tendencia character varying(20) DEFAULT 'estable'::character varying,
    fecha_actualizacion date DEFAULT CURRENT_DATE
);


--
-- Name: precios_maiz_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.precios_maiz_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: precios_maiz_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.precios_maiz_id_seq OWNED BY public.precios_maiz.id;


--
-- Name: producer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producer (
    producer_id bigint NOT NULL,
    curp character(18) NOT NULL,
    phone character varying(20),
    privacy_consent boolean DEFAULT true NOT NULL,
    usuario_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    nombres character varying(100),
    apellido_paterno character varying(100),
    apellido_materno character varying(100),
    sexo character varying(20),
    correo_electronico character varying(100),
    state_id character varying(2),
    municipality_id character varying(5),
    localidad character varying(100),
    tecnico_asignado_id integer,
    estatus_registro character varying(20) DEFAULT 'pendiente'::character varying,
    observaciones text,
    fecha_captura timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    usuario_capturista_id integer,
    programas_beneficiario text[] DEFAULT '{}'::text[],
    estado_validacion character varying(20) DEFAULT 'activo'::character varying,
    tipo_registro character(1) DEFAULT 'A'::bpchar,
    correo text,
    nota_admin text,
    aviso_privacidad_aceptado boolean DEFAULT false,
    aviso_privacidad_fecha timestamp with time zone,
    aviso_privacidad_lat numeric(10,7),
    aviso_privacidad_lng numeric(10,7),
    aviso_privacidad_version character varying(20) DEFAULT '1.0'::character varying,
    aviso_privacidad_foto_url text,
    fecha_nacimiento date,
    fuente_registro character varying(30),
    CONSTRAINT chk_producer_tiene_dueno CHECK (((usuario_id IS NOT NULL) OR (usuario_capturista_id IS NOT NULL)))
);


--
-- Name: producer_producer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.producer_producer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: producer_producer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.producer_producer_id_seq OWNED BY public.producer.producer_id;


--
-- Name: producer_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producer_profile (
    user_id integer NOT NULL,
    state_id character varying(2) NOT NULL,
    municipality_id character varying(5),
    locality character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: propuestas_negociacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propuestas_negociacion (
    id integer NOT NULL,
    disponibilidad_id integer NOT NULL,
    producer_id integer NOT NULL,
    precio_solicitado_ton numeric(10,2) NOT NULL,
    precio_referencia_ton numeric(10,2),
    volumen_ton numeric(10,2) NOT NULL,
    volumen_minimo_comprador numeric(10,2),
    lugar_entrega text,
    estatus character varying(20) DEFAULT 'abierta'::character varying NOT NULL,
    ganadora_oferta_id integer,
    vigencia_hasta date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT propuestas_negociacion_estatus_check CHECK (((estatus)::text = ANY (ARRAY[('abierta'::character varying)::text, ('cerrada'::character varying)::text, ('vencida'::character varying)::text, ('cancelada'::character varying)::text])))
);


--
-- Name: propuestas_negociacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.propuestas_negociacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: propuestas_negociacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.propuestas_negociacion_id_seq OWNED BY public.propuestas_negociacion.id;


--
-- Name: regiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regiones (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    estado character varying(100)
);


--
-- Name: regiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regiones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regiones_id_seq OWNED BY public.regiones.id;


--
-- Name: registro_idempotencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registro_idempotencia (
    clave character varying(80) NOT NULL,
    huella character varying(64) NOT NULL,
    resultado jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: revoked_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revoked_tokens (
    jti text NOT NULL,
    usuario_id integer,
    expira_en timestamp with time zone NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles_panel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_panel (
    id integer NOT NULL,
    clave character varying(40) NOT NULL,
    etiqueta character varying(80) NOT NULL,
    permisos_totales boolean DEFAULT false NOT NULL,
    aplica_filtro_estado boolean DEFAULT false NOT NULL,
    redirect_post_login character varying(60) DEFAULT '/admin'::character varying NOT NULL,
    vistas_default jsonb
);


--
-- Name: roles_panel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_panel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_panel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_panel_id_seq OWNED BY public.roles_panel.id;


--
-- Name: seguimiento_incidencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seguimiento_incidencias (
    id integer NOT NULL,
    producer_id bigint NOT NULL,
    up_id bigint NOT NULL,
    ciclo_id bigint NOT NULL,
    tipo_incidencia character varying(30) NOT NULL,
    severidad character varying(10) NOT NULL,
    fecha date NOT NULL,
    observaciones text,
    usuario_captura integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    cycle_crop_id bigint,
    CONSTRAINT chk_fecha_incidencia_no_futura CHECK ((fecha <= CURRENT_DATE)),
    CONSTRAINT chk_severidad CHECK (((severidad)::text = ANY (ARRAY[('baja'::character varying)::text, ('media'::character varying)::text, ('alta'::character varying)::text]))),
    CONSTRAINT chk_tipo_incidencia CHECK (((tipo_incidencia)::text = ANY (ARRAY[('sequia'::character varying)::text, ('lluvia_excesiva'::character varying)::text, ('plaga'::character varying)::text, ('enfermedad'::character varying)::text, ('viento'::character varying)::text, ('helada'::character varying)::text, ('granizo'::character varying)::text, ('otro'::character varying)::text])))
);


--
-- Name: seguimiento_incidencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seguimiento_incidencias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seguimiento_incidencias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seguimiento_incidencias_id_seq OWNED BY public.seguimiento_incidencias.id;


--
-- Name: seguimiento_visitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seguimiento_visitas (
    id integer NOT NULL,
    producer_id bigint NOT NULL,
    up_id bigint NOT NULL,
    ciclo_id bigint NOT NULL,
    fecha_visita date NOT NULL,
    etapa_cultivo character varying(30) NOT NULL,
    estado_cultivo character varying(20) NOT NULL,
    observaciones text,
    precio_observado double precision,
    tipo_maiz character varying(50),
    usuario_captura integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    cycle_crop_id bigint,
    CONSTRAINT chk_estado_cultivo CHECK (((estado_cultivo)::text = ANY (ARRAY[('bueno'::character varying)::text, ('regular'::character varying)::text, ('malo'::character varying)::text]))),
    CONSTRAINT chk_etapa_cultivo CHECK (((etapa_cultivo)::text = ANY (ARRAY[('siembra'::character varying)::text, ('crecimiento'::character varying)::text, ('floracion'::character varying)::text, ('llenado'::character varying)::text, ('madurez'::character varying)::text]))),
    CONSTRAINT chk_fecha_no_futura CHECK ((fecha_visita <= CURRENT_DATE)),
    CONSTRAINT chk_precio_maiz CHECK (((precio_observado IS NULL) OR ((precio_observado > (0)::double precision) AND (tipo_maiz IS NOT NULL))))
);


--
-- Name: seguimiento_visitas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seguimiento_visitas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seguimiento_visitas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seguimiento_visitas_id_seq OWNED BY public.seguimiento_visitas.id;


--
-- Name: senal_interesados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.senal_interesados (
    id bigint NOT NULL,
    senal_id integer NOT NULL,
    producer_id bigint NOT NULL,
    usuario_id integer,
    municipio character varying(150),
    estado character varying(100),
    telefono character varying(20),
    nombre_productor character varying(200),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: senal_interesados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.senal_interesados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: senal_interesados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.senal_interesados_id_seq OWNED BY public.senal_interesados.id;


--
-- Name: senal_variedades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.senal_variedades (
    id bigint NOT NULL,
    senal_id bigint NOT NULL,
    variedad_code character varying(40) NOT NULL,
    variedad_libre text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE senal_variedades; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.senal_variedades IS 'Variedades de maíz solicitadas en cada requerimiento de bodega';


--
-- Name: senal_variedades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.senal_variedades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: senal_variedades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.senal_variedades_id_seq OWNED BY public.senal_variedades.id;


--
-- Name: senales_compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.senales_compra (
    id integer NOT NULL,
    bodega_id integer NOT NULL,
    usuario_id integer NOT NULL,
    tipo_maiz character varying(20) NOT NULL,
    variedad_code character varying(40),
    volumen_ton numeric(10,2),
    precio_ofrecido numeric(10,2) NOT NULL,
    radio_km integer DEFAULT 50,
    vigencia character varying(20) NOT NULL,
    fecha_vencimiento date NOT NULL,
    activa boolean DEFAULT true,
    interesados_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    vigencia_inicio date,
    humedad_max_pct numeric(4,1),
    impurezas_max_pct numeric(4,1),
    grano_quebrado_max_pct numeric(4,1),
    CONSTRAINT senales_compra_vigencia_check2 CHECK (((vigencia)::text = ANY (ARRAY[('esta_semana'::character varying)::text, ('15_dias'::character varying)::text, ('rango'::character varying)::text])))
);


--
-- Name: senales_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.senales_compra_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: senales_compra_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.senales_compra_id_seq OWNED BY public.senales_compra.id;


--
-- Name: senasica_cargas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.senasica_cargas (
    id integer NOT NULL,
    nombre_archivo character varying(255) NOT NULL,
    usuario_id integer,
    total_puntos integer DEFAULT 0,
    total_ups_afectadas integer DEFAULT 0,
    total_notificaciones integer DEFAULT 0,
    estado character varying(20) DEFAULT 'procesando'::character varying,
    error_detalle text,
    created_at timestamp with time zone DEFAULT now(),
    completado_en timestamp with time zone
);


--
-- Name: TABLE senasica_cargas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.senasica_cargas IS 'Historial de archivos CSV cargados desde SENASICA. Permite auditar quién cargó qué y cuándo.';


--
-- Name: senasica_cargas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.senasica_cargas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: senasica_cargas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.senasica_cargas_id_seq OWNED BY public.senasica_cargas.id;


--
-- Name: senasica_parametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.senasica_parametros (
    id integer NOT NULL,
    nivel_riesgo character varying(10) NOT NULL,
    radio_km integer NOT NULL,
    activo boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE senasica_parametros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.senasica_parametros IS 'Parámetros configurables del módulo fitosanitario SENASICA. Modificar radio_km aquí sin tocar código.';


--
-- Name: senasica_parametros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.senasica_parametros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: senasica_parametros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.senasica_parametros_id_seq OWNED BY public.senasica_parametros.id;


--
-- Name: sesiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesiones (
    id integer NOT NULL,
    usuario_id integer,
    token_hash character varying(255) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: sesiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sesiones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sesiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sesiones_id_seq OWNED BY public.sesiones.id;


--
-- Name: solicitudes_apoyo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_apoyo (
    id integer NOT NULL,
    ventanilla_id integer NOT NULL,
    apoyo_id integer,
    producer_id bigint,
    estado character varying(20) DEFAULT 'recibida'::character varying,
    notas text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT solicitudes_apoyo_estado_check CHECK (((estado)::text = ANY (ARRAY[('recibida'::character varying)::text, ('contactado'::character varying)::text, ('agendada'::character varying)::text, ('canalizada'::character varying)::text, ('cerrada'::character varying)::text])))
);


--
-- Name: solicitudes_apoyo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_apoyo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_apoyo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_apoyo_id_seq OWNED BY public.solicitudes_apoyo.id;


--
-- Name: supervisor_productores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supervisor_productores (
    id integer NOT NULL,
    supervisor_id integer NOT NULL,
    producer_id integer NOT NULL,
    fecha_vinculacion timestamp without time zone DEFAULT now()
);


--
-- Name: supervisor_productores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supervisor_productores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supervisor_productores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supervisor_productores_id_seq OWNED BY public.supervisor_productores.id;


--
-- Name: tarifario_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarifario_servicios (
    id integer NOT NULL,
    bodega_id integer NOT NULL,
    concepto_id integer NOT NULL,
    precio numeric(10,2) NOT NULL,
    vigencia_inicio date DEFAULT CURRENT_DATE,
    vigencia_fin date,
    activo boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tarifario_servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tarifario_servicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tarifario_servicios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tarifario_servicios_id_seq OWNED BY public.tarifario_servicios.id;


--
-- Name: transacciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transacciones (
    id integer NOT NULL,
    bodega_id integer NOT NULL,
    usuario_bodeguero integer NOT NULL,
    producer_id bigint,
    nombre_productor_libre character varying(200),
    tipo_maiz character varying(20) NOT NULL,
    variedad_code character varying(40),
    volumen_ton numeric(10,2) NOT NULL,
    precio_ton numeric(10,2) NOT NULL,
    fecha date NOT NULL,
    confirmacion_productor character varying(20) DEFAULT 'pendiente'::character varying,
    peso_precio_sistema numeric(3,2) DEFAULT 0.5,
    notas text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    humedad_pct numeric(4,1),
    impurezas_pct numeric(4,1),
    grano_quebrado_pct numeric(4,1),
    propuesta_id integer,
    CONSTRAINT transacciones_confirmacion_productor_check CHECK (((confirmacion_productor)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('confirmada'::character varying)::text, ('discrepancia'::character varying)::text, ('expirada'::character varying)::text]))),
    CONSTRAINT transacciones_fecha_check CHECK ((fecha <= CURRENT_DATE))
);


--
-- Name: transacciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transacciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transacciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transacciones_id_seq OWNED BY public.transacciones.id;


--
-- Name: up; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.up (
    up_id bigint NOT NULL,
    producer_id bigint NOT NULL,
    up_name character varying(80) NOT NULL,
    up_type character varying(20) NOT NULL,
    production_system character varying(30) NOT NULL,
    water_regime character varying(10) NOT NULL,
    geom public.geometry(MultiPolygon,4326),
    centroid public.geometry(Point,4326),
    area_ha_calc numeric,
    state_name character varying(100),
    municipality_name character varying(150),
    state_id character varying(2),
    municipality_id character varying(5),
    location_confirmed boolean,
    location_correction_reason character varying(30),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    coincide_superficie_calculada boolean,
    area_real_declarada_ha double precision,
    motivo_diferencia_superficie text,
    centroid_source character varying(20) DEFAULT 'municipio'::character varying,
    area_ha_real numeric(10,4),
    coincide_area boolean,
    domicilio_actualizado_en timestamp with time zone,
    domicilio_actualizado_por character varying(20) DEFAULT 'productor'::character varying,
    posible_traslape_producer_id integer,
    traslape_revisado boolean DEFAULT false
);


--
-- Name: COLUMN up.coincide_superficie_calculada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.up.coincide_superficie_calculada IS 'Respuesta del productor: ¿la sup. calculada coincide con la real?';


--
-- Name: COLUMN up.area_real_declarada_ha; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.up.area_real_declarada_ha IS 'Superficie real declarada por el productor cuando difiere de la calculada';


--
-- Name: COLUMN up.motivo_diferencia_superficie; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.up.motivo_diferencia_superficie IS 'Motivo opcional de la diferencia entre superficie calculada y declarada';


--
-- Name: up_up_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.up_up_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: up_up_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.up_up_id_seq OWNED BY public.up.up_id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    email character varying(255),
    curp character varying(18),
    nombre_completo character varying(255),
    password_hash character varying(255) NOT NULL,
    telefono character varying(20),
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    rol character varying(20) DEFAULT 'general'::character varying,
    state_id character varying(2),
    municipality_id character varying(5),
    aviso_privacidad_aceptado boolean DEFAULT false,
    aviso_privacidad_fecha timestamp with time zone,
    aviso_privacidad_lat double precision,
    aviso_privacidad_lng double precision,
    aviso_privacidad_version character varying(20),
    aviso_privacidad_foto_url text,
    push_endpoint text,
    push_p256dh text,
    push_auth text,
    push_activo boolean DEFAULT false,
    reset_token character varying(128),
    reset_token_expires timestamp with time zone,
    reset_pin_forced boolean DEFAULT false,
    pin_texto character varying(10),
    es_panel_usuario boolean DEFAULT false,
    estado_asignado character varying(60) DEFAULT NULL::character varying,
    debe_cambiar_pass boolean DEFAULT false,
    ultimo_login timestamp with time zone,
    intentos_fallidos integer DEFAULT 0 NOT NULL,
    bloqueado_hasta timestamp with time zone,
    sesion_activa_jti character varying(64)
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: ventanillas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventanillas (
    id integer NOT NULL,
    bodega_id integer NOT NULL,
    usuario_id integer NOT NULL,
    nombre_enlace_agricultura character varying(200) NOT NULL,
    nombre_ventanilla character varying(200),
    telefono_responsable character varying(20) NOT NULL,
    correo_responsable character varying(200) NOT NULL,
    tipo character varying(20),
    estatus character varying(20) DEFAULT 'activa'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ventanillas_estatus_check CHECK (((estatus)::text = ANY (ARRAY[('activa'::character varying)::text, ('inactiva'::character varying)::text]))),
    CONSTRAINT ventanillas_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('coberturas'::character varying)::text, ('incentivos'::character varying)::text, ('ambos'::character varying)::text])))
);


--
-- Name: ventanillas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ventanillas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ventanillas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ventanillas_id_seq OWNED BY public.ventanillas.id;


--
-- Name: admin_permisos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_permisos ALTER COLUMN id SET DEFAULT nextval('public.admin_permisos_id_seq'::regclass);


--
-- Name: alertas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas ALTER COLUMN id SET DEFAULT nextval('public.alertas_id_seq'::regclass);


--
-- Name: alertas_externas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas_externas ALTER COLUMN id SET DEFAULT nextval('public.alertas_externas_id_seq'::regclass);


--
-- Name: apoyos_ventanilla id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apoyos_ventanilla ALTER COLUMN id SET DEFAULT nextval('public.apoyos_ventanilla_id_seq'::regclass);


--
-- Name: bodegas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bodegas ALTER COLUMN id SET DEFAULT nextval('public.bodegas_id_seq'::regclass);


--
-- Name: bodeguero_bodegas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bodeguero_bodegas ALTER COLUMN id SET DEFAULT nextval('public.bodeguero_bodegas_id_seq'::regclass);


--
-- Name: cat_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_catalog ALTER COLUMN id SET DEFAULT nextval('public.cat_catalog_id_seq'::regclass);


--
-- Name: cat_conceptos_servicio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_conceptos_servicio ALTER COLUMN id SET DEFAULT nextval('public.cat_conceptos_servicio_id_seq'::regclass);


--
-- Name: cat_crop_variety id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_crop_variety ALTER COLUMN id SET DEFAULT nextval('public.cat_crop_variety_id_seq'::regclass);


--
-- Name: cat_programas_gobierno id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cat_programas_gobierno ALTER COLUMN id SET DEFAULT nextval('public.cat_programas_gobierno_id_seq'::regclass);


--
-- Name: chat_conversaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversaciones ALTER COLUMN id SET DEFAULT nextval('public.chat_conversaciones_id_seq'::regclass);


--
-- Name: chat_mensajes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_mensajes ALTER COLUMN id SET DEFAULT nextval('public.chat_mensajes_id_seq'::regclass);


--
-- Name: cosecha_real id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosecha_real ALTER COLUMN id SET DEFAULT nextval('public.cosecha_real_id_seq'::regclass);


--
-- Name: costos_fira id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costos_fira ALTER COLUMN id SET DEFAULT nextval('public.costos_fira_id_seq'::regclass);


--
-- Name: cycle cycle_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycle ALTER COLUMN cycle_id SET DEFAULT nextval('public.cycle_cycle_id_seq'::regclass);


--
-- Name: discrepancias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discrepancias ALTER COLUMN id SET DEFAULT nextval('public.discrepancias_id_seq'::regclass);


--
-- Name: disponibilidad_productor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disponibilidad_productor ALTER COLUMN id SET DEFAULT nextval('public.disponibilidad_productor_id_seq'::regclass);


--
-- Name: encuesta_alias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_alias ALTER COLUMN id SET DEFAULT nextval('public.encuesta_alias_id_seq'::regclass);


--
-- Name: encuesta_contexto_territorial id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_contexto_territorial ALTER COLUMN id SET DEFAULT nextval('public.encuesta_contexto_territorial_id_seq'::regclass);


--
-- Name: encuesta_ediciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_ediciones ALTER COLUMN id SET DEFAULT nextval('public.encuesta_ediciones_id_seq'::regclass);


--
-- Name: encuesta_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_lineas ALTER COLUMN id SET DEFAULT nextval('public.encuesta_lineas_id_seq'::regclass);


--
-- Name: encuesta_respuestas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_respuestas ALTER COLUMN id SET DEFAULT nextval('public.encuesta_respuestas_id_seq'::regclass);


--
-- Name: estimacion_cosecha id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimacion_cosecha ALTER COLUMN id SET DEFAULT nextval('public.estimacion_cosecha_id_seq'::regclass);


--
-- Name: filtros_guardados_bodega id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtros_guardados_bodega ALTER COLUMN id SET DEFAULT nextval('public.filtros_guardados_bodega_id_seq'::regclass);


--
-- Name: infraestructura_contactos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infraestructura_contactos ALTER COLUMN id SET DEFAULT nextval('public.infraestructura_contactos_id_seq'::regclass);


--
-- Name: inventarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventarios ALTER COLUMN id SET DEFAULT nextval('public.inventarios_id_seq'::regclass);


--
-- Name: notificaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN id SET DEFAULT nextval('public.notificaciones_id_seq'::regclass);


--
-- Name: oferta_interes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oferta_interes ALTER COLUMN id SET DEFAULT nextval('public.oferta_interes_id_seq'::regclass);


--
-- Name: ofertas_bodega id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas_bodega ALTER COLUMN id SET DEFAULT nextval('public.ofertas_bodega_id_seq'::regclass);


--
-- Name: precio_parametros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precio_parametros ALTER COLUMN id SET DEFAULT nextval('public.precio_parametros_id_seq'::regclass);


--
-- Name: precio_referencias_externas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precio_referencias_externas ALTER COLUMN id SET DEFAULT nextval('public.precio_referencias_externas_id_seq'::regclass);


--
-- Name: precios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios ALTER COLUMN id SET DEFAULT nextval('public.precios_id_seq'::regclass);


--
-- Name: precios_maiz id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios_maiz ALTER COLUMN id SET DEFAULT nextval('public.precios_maiz_id_seq'::regclass);


--
-- Name: producer producer_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producer ALTER COLUMN producer_id SET DEFAULT nextval('public.producer_producer_id_seq'::regclass);


--
-- Name: propuestas_negociacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propuestas_negociacion ALTER COLUMN id SET DEFAULT nextval('public.propuestas_negociacion_id_seq'::regclass);


--
-- Name: regiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regiones ALTER COLUMN id SET DEFAULT nextval('public.regiones_id_seq'::regclass);


--
-- Name: roles_panel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_panel ALTER COLUMN id SET DEFAULT nextval('public.roles_panel_id_seq'::regclass);


--
-- Name: seguimiento_incidencias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimiento_incidencias ALTER COLUMN id SET DEFAULT nextval('public.seguimiento_incidencias_id_seq'::regclass);


--
-- Name: seguimiento_visitas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimiento_visitas ALTER COLUMN id SET DEFAULT nextval('public.seguimiento_visitas_id_seq'::regclass);


--
-- Name: senal_interesados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.senal_interesados ALTER COLUMN id SET DEFAULT nextval('public.senal_interesados_id_seq'::regclass);


--
-- Name: senal_variedades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.senal_variedades ALTER COLUMN id SET DEFAULT nextval('public.senal_variedades_id_seq'::regclass);


--
-- Name: senales_compra id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.senales_compra ALTER COLUMN id SET DEFAULT nextval('public.senales_compra_id_seq'::regclass);


--
-- Name: senasica_cargas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.senasica_cargas ALTER COLUMN id SET DEFAULT nextval('public.senasica_cargas_id_seq'::regclass);


--
-- Name: senasica_parametros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.senasica_parametros ALTER COLUMN id SET DEFAULT nextval('public.senasica_parametros_id_seq'::regclass);


--
-- Name: sesiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones ALTER COLUMN id SET DEFAULT nextval('public.sesiones_id_seq'::regclass);


--
-- Name: solicitudes_apoyo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_apoyo ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_apoyo_id_seq'::regclass);


--
-- Name: supervisor_productores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_productores ALTER COLUMN id SET DEFAULT nextval('public.supervisor_productores_id_seq'::regclass);


--
-- Name: tarifario_servicios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifario_servicios ALTER COLUMN id SET DEFAULT nextval('public.tarifario_servicios_id_seq'::regclass);


--
-- Name: transacciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones ALTER COLUMN id SET DEFAULT nextval('public.transacciones_id_seq'::regclass);


--
-- Name: up up_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.up ALTER COLUMN up_id SET DEFAULT nextval('public.up_up_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: ventanillas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventanillas ALTER COLUMN id SET DEFAULT nextval('public.ventanillas_id_seq'::regclass);


--
-- Name: admin_permisos admin_permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_permisos
    ADD CONSTRAINT admin_permisos_pkey PRIMARY KEY (id);


--
-- Name: alertas_externas alertas_externas_id_alerta_origen_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas_externas
    ADD CONSTRAINT alertas_externas_id_alerta_origen_key UNIQUE (id_alerta_origen);


--
-- Name: alertas_externas alertas_externas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas_externas
    ADD CONSTRAINT alertas_externas_pkey PRIMARY KEY (id);


--
-- Name: alertas_up alertas_up_alerta_up_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas_up
    ADD CONSTRAINT alertas_up_alerta_up_unique UNIQUE (alerta_id, up_id);


--
-- Name: bodegas bodegas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bodegas
    ADD CONSTRAINT bodegas_pkey PRIMARY KEY (id);


--
-- Name: bodeguero_bodegas bodeguero_bodegas_usuario_id_bodega_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bodeguero_bodegas
    ADD CONSTRAINT bodeguero_bodegas_usuario_id_bodega_id_key UNIQUE (usuario_id, bodega_id);


--
-- Name: chat_conversaciones chat_conversaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversaciones
    ADD CONSTRAINT chat_conversaciones_pkey PRIMARY KEY (id);


--
-- Name: chat_conversaciones chat_conversaciones_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversaciones
    ADD CONSTRAINT chat_conversaciones_usuario_id_key UNIQUE (usuario_id);


--
-- Name: chat_mensajes chat_mensajes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_mensajes
    ADD CONSTRAINT chat_mensajes_pkey PRIMARY KEY (id);


--
-- Name: cycle_crop cycle_crop_cycle_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycle_crop
    ADD CONSTRAINT cycle_crop_cycle_unique UNIQUE (cycle_id);


--
-- Name: cycle_crop cycle_crop_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycle_crop
    ADD CONSTRAINT cycle_crop_pkey PRIMARY KEY (cycle_crop_id);


--
-- Name: disponibilidad_productor disponibilidad_productor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disponibilidad_productor
    ADD CONSTRAINT disponibilidad_productor_pkey PRIMARY KEY (id);


--
-- Name: encuesta_alias encuesta_alias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_alias
    ADD CONSTRAINT encuesta_alias_pkey PRIMARY KEY (id);


--
-- Name: encuesta_categorias encuesta_categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_categorias
    ADD CONSTRAINT encuesta_categorias_pkey PRIMARY KEY (id);


--
-- Name: encuesta_contexto_territorial encuesta_contexto_territorial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_contexto_territorial
    ADD CONSTRAINT encuesta_contexto_territorial_pkey PRIMARY KEY (id);


--
-- Name: encuesta_contexto_territorial encuesta_contexto_territorial_respuesta_id_up_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_contexto_territorial
    ADD CONSTRAINT encuesta_contexto_territorial_respuesta_id_up_id_key UNIQUE (respuesta_id, up_id);


--
-- Name: encuesta_ediciones encuesta_ediciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_ediciones
    ADD CONSTRAINT encuesta_ediciones_pkey PRIMARY KEY (id);


--
-- Name: encuesta_lineas encuesta_lineas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_lineas
    ADD CONSTRAINT encuesta_lineas_pkey PRIMARY KEY (id);


--
-- Name: encuesta_presentaciones encuesta_presentaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_presentaciones
    ADD CONSTRAINT encuesta_presentaciones_pkey PRIMARY KEY (id);


--
-- Name: encuesta_productos encuesta_productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_productos
    ADD CONSTRAINT encuesta_productos_pkey PRIMARY KEY (id);


--
-- Name: encuesta_respuestas encuesta_respuestas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_respuestas
    ADD CONSTRAINT encuesta_respuestas_pkey PRIMARY KEY (id);


--
-- Name: encuesta_respuestas encuesta_respuestas_producer_id_edicion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_respuestas
    ADD CONSTRAINT encuesta_respuestas_producer_id_edicion_id_key UNIQUE (producer_id, edicion_id);


--
-- Name: filtros_guardados_bodega filtros_guardados_bodega_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtros_guardados_bodega
    ADD CONSTRAINT filtros_guardados_bodega_pkey PRIMARY KEY (id);


--
-- Name: geo_municipality geo_municipality_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_municipality
    ADD CONSTRAINT geo_municipality_pkey PRIMARY KEY (municipality_id);


--
-- Name: municipios_referencia municipios_referencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.municipios_referencia
    ADD CONSTRAINT municipios_referencia_pkey PRIMARY KEY (cve_geo);


--
-- Name: ofertas_bodega ofertas_bodega_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas_bodega
    ADD CONSTRAINT ofertas_bodega_pkey PRIMARY KEY (id);


--
-- Name: ofertas_bodega ofertas_bodega_propuesta_id_bodega_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas_bodega
    ADD CONSTRAINT ofertas_bodega_propuesta_id_bodega_id_key UNIQUE (propuesta_id, bodega_id);


--
-- Name: producer producer_curp_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producer
    ADD CONSTRAINT producer_curp_unique UNIQUE (curp);


--
-- Name: producer producer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producer
    ADD CONSTRAINT producer_pkey PRIMARY KEY (producer_id);


--
-- Name: propuestas_negociacion propuestas_negociacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propuestas_negociacion
    ADD CONSTRAINT propuestas_negociacion_pkey PRIMARY KEY (id);


--
-- Name: registro_idempotencia registro_idempotencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registro_idempotencia
    ADD CONSTRAINT registro_idempotencia_pkey PRIMARY KEY (clave);


--
-- Name: revoked_tokens revoked_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revoked_tokens
    ADD CONSTRAINT revoked_tokens_pkey PRIMARY KEY (jti);


--
-- Name: roles_panel roles_panel_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_panel
    ADD CONSTRAINT roles_panel_clave_key UNIQUE (clave);


--
-- Name: roles_panel roles_panel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_panel
    ADD CONSTRAINT roles_panel_pkey PRIMARY KEY (id);


--
-- Name: up up_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.up
    ADD CONSTRAINT up_pkey PRIMARY KEY (up_id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_permisos_usuario_vista_accion; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_admin_permisos_usuario_vista_accion ON public.admin_permisos USING btree (usuario_id, vista, sub_accion);


--
-- Name: idx_alertas_externas_activa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alertas_externas_activa ON public.alertas_externas USING btree (activa) WHERE (activa = true);


--
-- Name: idx_alertas_externas_geo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alertas_externas_geo ON public.alertas_externas USING gist (coordenada);


--
-- Name: idx_alertas_externas_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alertas_externas_geom ON public.alertas_externas USING gist (coordenada);


--
-- Name: idx_chat_conv_ultimo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conv_ultimo ON public.chat_conversaciones USING btree (ultimo_mensaje_at DESC);


--
-- Name: idx_chat_mensajes_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_mensajes_conv ON public.chat_mensajes USING btree (conversacion_id, created_at);


--
-- Name: idx_cycle_up_id_year_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cycle_up_id_year_id ON public.cycle USING btree (up_id, cycle_year DESC, cycle_id DESC);


--
-- Name: idx_encuesta_alias_texto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encuesta_alias_texto ON public.encuesta_alias USING btree (texto_busqueda);


--
-- Name: idx_encuesta_contexto_municipio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encuesta_contexto_municipio ON public.encuesta_contexto_territorial USING btree (municipality_id);


--
-- Name: idx_encuesta_lineas_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encuesta_lineas_producto ON public.encuesta_lineas USING btree (producto_id);


--
-- Name: idx_encuesta_lineas_respuesta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encuesta_lineas_respuesta ON public.encuesta_lineas USING btree (respuesta_id);


--
-- Name: idx_encuesta_presentaciones_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encuesta_presentaciones_producto ON public.encuesta_presentaciones USING btree (producto_id);


--
-- Name: idx_encuesta_productos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encuesta_productos_categoria ON public.encuesta_productos USING btree (categoria_id);


--
-- Name: idx_filtros_guardados_bodega_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_filtros_guardados_bodega_activo ON public.filtros_guardados_bodega USING btree (activo);


--
-- Name: idx_filtros_guardados_bodega_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_filtros_guardados_bodega_usuario ON public.filtros_guardados_bodega USING btree (usuario_id);


--
-- Name: idx_municipios_referencia_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_municipios_referencia_nombre ON public.municipios_referencia USING btree (lower((nombre)::text), lower((estado)::text));


--
-- Name: idx_ofertas_bodega_bodega; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_bodega_bodega ON public.ofertas_bodega USING btree (bodega_id);


--
-- Name: idx_ofertas_bodega_propuesta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_bodega_propuesta ON public.ofertas_bodega USING btree (propuesta_id);


--
-- Name: idx_producer_capturista; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_producer_capturista ON public.producer USING btree (usuario_capturista_id);


--
-- Name: idx_propuestas_negociacion_estatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_propuestas_negociacion_estatus ON public.propuestas_negociacion USING btree (estatus);


--
-- Name: idx_propuestas_negociacion_producer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_propuestas_negociacion_producer ON public.propuestas_negociacion USING btree (producer_id);


--
-- Name: idx_revoked_tokens_expira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revoked_tokens_expira ON public.revoked_tokens USING btree (expira_en);


--
-- Name: idx_unique_ciclo_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_ciclo_activo ON public.cycle USING btree (up_id, cycle_year, cycle_type) WHERE ((estado_ciclo)::text = 'activo'::text);


--
-- Name: idx_up_producer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_up_producer ON public.up USING btree (producer_id);


--
-- Name: idx_up_producer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_up_producer_id ON public.up USING btree (producer_id);


--
-- Name: idx_up_state_municipality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_up_state_municipality ON public.up USING btree (state_name, municipality_name) WHERE (geom IS NOT NULL);


--
-- Name: idx_up_traslape_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_up_traslape_pendiente ON public.up USING btree (traslape_revisado) WHERE (traslape_revisado = false);


--
-- Name: idx_usuarios_reset_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_reset_token ON public.usuarios USING btree (reset_token) WHERE (reset_token IS NOT NULL);


--
-- Name: up_geom_gix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX up_geom_gix ON public.up USING gist (geom);


--
-- Name: usuarios_curp_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_curp_unique_idx ON public.usuarios USING btree (curp) WHERE ((curp IS NOT NULL) AND ((curp)::text <> ''::text));


--
-- Name: usuarios_email_unique_app; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_email_unique_app ON public.usuarios USING btree (email) WHERE (es_panel_usuario IS NOT TRUE);


--
-- Name: usuarios_email_unique_panel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_email_unique_panel ON public.usuarios USING btree (email) WHERE (es_panel_usuario = true);


--
-- Name: up trigger_up_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_up_updated BEFORE UPDATE ON public.up FOR EACH ROW EXECUTE FUNCTION public.update_up_timestamp();


--
-- Name: admin_permisos admin_permisos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_permisos
    ADD CONSTRAINT admin_permisos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_conversaciones chat_conversaciones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversaciones
    ADD CONSTRAINT chat_conversaciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_mensajes chat_mensajes_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_mensajes
    ADD CONSTRAINT chat_mensajes_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id);


--
-- Name: chat_mensajes chat_mensajes_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_mensajes
    ADD CONSTRAINT chat_mensajes_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.chat_conversaciones(id) ON DELETE CASCADE;


--
-- Name: encuesta_alias encuesta_alias_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_alias
    ADD CONSTRAINT encuesta_alias_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.encuesta_productos(id);


--
-- Name: encuesta_contexto_territorial encuesta_contexto_territorial_respuesta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_contexto_territorial
    ADD CONSTRAINT encuesta_contexto_territorial_respuesta_id_fkey FOREIGN KEY (respuesta_id) REFERENCES public.encuesta_respuestas(id) ON DELETE CASCADE;


--
-- Name: encuesta_contexto_territorial encuesta_contexto_territorial_up_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_contexto_territorial
    ADD CONSTRAINT encuesta_contexto_territorial_up_id_fkey FOREIGN KEY (up_id) REFERENCES public.up(up_id);


--
-- Name: encuesta_lineas encuesta_lineas_presentacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_lineas
    ADD CONSTRAINT encuesta_lineas_presentacion_id_fkey FOREIGN KEY (presentacion_id) REFERENCES public.encuesta_presentaciones(id);


--
-- Name: encuesta_lineas encuesta_lineas_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_lineas
    ADD CONSTRAINT encuesta_lineas_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.encuesta_productos(id);


--
-- Name: encuesta_lineas encuesta_lineas_respuesta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_lineas
    ADD CONSTRAINT encuesta_lineas_respuesta_id_fkey FOREIGN KEY (respuesta_id) REFERENCES public.encuesta_respuestas(id) ON DELETE CASCADE;


--
-- Name: encuesta_presentaciones encuesta_presentaciones_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_presentaciones
    ADD CONSTRAINT encuesta_presentaciones_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.encuesta_productos(id);


--
-- Name: encuesta_productos encuesta_productos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_productos
    ADD CONSTRAINT encuesta_productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.encuesta_categorias(id);


--
-- Name: encuesta_respuestas encuesta_respuestas_capturista_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_respuestas
    ADD CONSTRAINT encuesta_respuestas_capturista_id_fkey FOREIGN KEY (capturista_id) REFERENCES public.usuarios(id);


--
-- Name: encuesta_respuestas encuesta_respuestas_edicion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_respuestas
    ADD CONSTRAINT encuesta_respuestas_edicion_id_fkey FOREIGN KEY (edicion_id) REFERENCES public.encuesta_ediciones(id);


--
-- Name: encuesta_respuestas encuesta_respuestas_producer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuesta_respuestas
    ADD CONSTRAINT encuesta_respuestas_producer_id_fkey FOREIGN KEY (producer_id) REFERENCES public.producer(producer_id);


--
-- Name: filtros_guardados_bodega filtros_guardados_bodega_bodega_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtros_guardados_bodega
    ADD CONSTRAINT filtros_guardados_bodega_bodega_id_fkey FOREIGN KEY (bodega_id) REFERENCES public.bodegas(id);


--
-- Name: filtros_guardados_bodega filtros_guardados_bodega_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtros_guardados_bodega
    ADD CONSTRAINT filtros_guardados_bodega_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: ofertas_bodega ofertas_bodega_bodega_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas_bodega
    ADD CONSTRAINT ofertas_bodega_bodega_id_fkey FOREIGN KEY (bodega_id) REFERENCES public.bodegas(id);


--
-- Name: ofertas_bodega ofertas_bodega_propuesta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas_bodega
    ADD CONSTRAINT ofertas_bodega_propuesta_id_fkey FOREIGN KEY (propuesta_id) REFERENCES public.propuestas_negociacion(id);


--
-- Name: ofertas_bodega ofertas_bodega_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas_bodega
    ADD CONSTRAINT ofertas_bodega_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: propuestas_negociacion propuestas_negociacion_disponibilidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propuestas_negociacion
    ADD CONSTRAINT propuestas_negociacion_disponibilidad_id_fkey FOREIGN KEY (disponibilidad_id) REFERENCES public.disponibilidad_productor(id);


--
-- Name: propuestas_negociacion propuestas_negociacion_producer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propuestas_negociacion
    ADD CONSTRAINT propuestas_negociacion_producer_id_fkey FOREIGN KEY (producer_id) REFERENCES public.producer(producer_id);


--
-- Name: transacciones transacciones_propuesta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones
    ADD CONSTRAINT transacciones_propuesta_id_fkey FOREIGN KEY (propuesta_id) REFERENCES public.propuestas_negociacion(id);


--
-- Name: up up_posible_traslape_producer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.up
    ADD CONSTRAINT up_posible_traslape_producer_id_fkey FOREIGN KEY (posible_traslape_producer_id) REFERENCES public.producer(producer_id);


--
-- PostgreSQL database dump complete
--

\unrestrict rAp2HXnGwkK925DJ3BdboHBJWX5VlDHJHWfYLLk5ShOh4GbWHxk4zCP2ZfQVshZ

