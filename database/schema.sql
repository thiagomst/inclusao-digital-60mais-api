CREATE DATABASE IF NOT EXISTS inclusao_digital
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inclusao_digital;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  senha_hash VARCHAR(60) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_sessoes_usuario_expira (usuario_id, expira_em),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alunos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  nome VARCHAR(120) NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  email VARCHAR(254) NULL,
  idade TINYINT UNSIGNED NOT NULL,
  nivel_tecnologia ENUM('iniciante', 'basico', 'intermediario') NOT NULL DEFAULT 'iniciante',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alunos_usuario_nome (usuario_id, nome),
  KEY idx_alunos_usuario_email (usuario_id, email),
  CONSTRAINT fk_alunos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT chk_alunos_idade CHECK (idade BETWEEN 60 AND 120)
);
