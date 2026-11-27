<?php

namespace App\Exceptions;

use RuntimeException;

/** Erro de regra de negócio: a mensagem é para o usuário (src/server/erros.ts). */
class ErroNegocio extends RuntimeException {}
