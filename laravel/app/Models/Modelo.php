<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Base dos models do sistema: o schema veio do Prisma (docs/29, 3.1), com datas em DATETIME(3) e sem lista de campos
 * protegidos (a validação fica nos Form Requests e Services, nunca em `create($request->all())`).
 */
abstract class Modelo extends Model
{
    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.v';
}
