export default {
    async fetch(request, env) {

        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_KEY = env.SUPABASE_KEY;
        const ADMIN_API_KEY = env.ADMIN_API_KEY;

        const url = new URL(request.url);
        const method = request.method;

        const now = Date.now();

        const supabaseHeaders = {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        };


        // =====================================================
        // JSON RESPONSE
        // =====================================================

        function jsonResponse(data, status = 200) {

            return new Response(
                JSON.stringify(data),
                {
                    status,

                    headers: {
                        "Content-Type":
                            "application/json; charset=utf-8",

                        "Access-Control-Allow-Origin":
                            "*",

                        "Access-Control-Allow-Headers":
                            "Content-Type, x-manox-key",

                        "Access-Control-Allow-Methods":
                            "GET, POST, DELETE, OPTIONS"
                    }
                }
            );

        }


        // =====================================================
        // CORS PREFLIGHT
        // =====================================================

        if (method === "OPTIONS") {

            return new Response(null, {
                status: 204,

                headers: {
                    "Access-Control-Allow-Origin":
                        "*",

                    "Access-Control-Allow-Headers":
                        "Content-Type, x-manox-key",

                    "Access-Control-Allow-Methods":
                        "GET, POST, DELETE, OPTIONS",

                    "Access-Control-Max-Age":
                        "86400"
                }
            });

        }


        // =====================================================
        // BODY
        // =====================================================

        async function getBody() {

            try {

                return await request.json();

            } catch {

                return {};

            }

        }


        // =====================================================
        // ADMIN KEY
        // =====================================================

        function checkAdminKey() {

            const clientKey =
                request.headers.get(
                    "x-manox-key"
                );

            if (!ADMIN_API_KEY) {
                return false;
            }

            return (
                clientKey &&
                clientKey === ADMIN_API_KEY
            );

        }


        // =====================================================
        // ADMIN AUTH
        // =====================================================

        function requireAdmin() {

            if (!checkAdminKey()) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Não autorizado."
                    },
                    401
                );

            }

            return null;

        }


        // =====================================================
        // SUPABASE REQUEST
        // =====================================================

        async function supabase(
            path,
            options = {}
        ) {

            return fetch(
                `${SUPABASE_URL}/rest/v1/${path}`,
                {
                    ...options,

                    headers: {
                        ...supabaseHeaders,
                        ...(options.headers || {})
                    }
                }
            );

        }


        // =====================================================
        // JOB ID
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/send-jobid"
        ) {

            const {
                username,
                placeId,
                jobId
            } = await getBody();


            if (
                !username ||
                !placeId ||
                !jobId
            ) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Dados incompletos."
                    },
                    400
                );

            }


            const res =
                await supabase(
                    "player_sessions",
                    {
                        method: "POST",

                        headers: {
                            "Prefer":
                                "resolution=merge-duplicates"
                        },

                        body:
                            JSON.stringify({
                                id: "current",

                                username:
                                    username.trim(),

                                place_id:
                                    String(placeId),

                                job_id:
                                    String(jobId),

                                timestamp:
                                    now
                            })
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Erro ao salvar sessão."
                    },
                    500
                );

            }


            return jsonResponse({
                success: true,

                message:
                    "Sessão salva no Supabase com sucesso!"
            });

        }


        // =====================================================
        // GET JOB ID
        // =====================================================

        if (
            method === "GET" &&
            url.pathname ===
                "/api/manox/get-jobid"
        ) {

            const res =
                await supabase(
                    "player_sessions?id=eq.current"
                );


            const data =
                await res.json();


            if (
                Array.isArray(data) &&
                data.length > 0
            ) {

                return jsonResponse({

                    success: true,

                    username:
                        data[0].username,

                    placeId:
                        data[0].place_id,

                    jobId:
                        data[0].job_id,

                    timestamp:
                        data[0].timestamp

                });

            }


            return jsonResponse({

                success: true,

                username:
                    "Nenhum",

                placeId:
                    null,

                jobId:
                    null,

                timestamp:
                    null

            });

        }


        // =====================================================
        // ALL ROLES
        //
        // Esta rota permanece pública para o Roblox.
        // =====================================================

        if (
            method === "GET" &&
            url.pathname ===
                "/api/manox/all-roles"
        ) {

            const [
                ownersRes,
                adminsRes,
                tempRes
            ] = await Promise.all([

                supabase(
                    "owners?select=username"
                ),

                supabase(
                    "permanent_admins?select=username"
                ),

                supabase(
                    `temp_admins?expires_at=gt.${now}&select=username,expires_at`
                )

            ]);


            const owners =
                await ownersRes.json();

            const admins =
                await adminsRes.json();

            const tempAdmins =
                await tempRes.json();


            return jsonResponse({

                success: true,

                owners:
                    Array.isArray(owners)
                        ? owners.map(
                            x => x.username
                        )
                        : [],

                admins:
                    Array.isArray(admins)
                        ? admins.map(
                            x => x.username
                        )
                        : [],

                tempAdmins:
                    Array.isArray(tempAdmins)
                        ? tempAdmins
                        : []

            });

        }


        // =====================================================
        // TEMP ADMINS - LIST
        // =====================================================

        if (
            method === "GET" &&
            url.pathname ===
                "/api/manox/temp-admins"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const res =
                await supabase(
                    `temp_admins?expires_at=gt.${now}&order=expires_at.asc`
                );


            const admins =
                await res.json();


            return jsonResponse({

                success: true,

                admins:
                    Array.isArray(admins)
                        ? admins
                        : []

            });

        }


        // =====================================================
        // TEMP ADMIN - ADD
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/temp-admins/add"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                username,
                durationMinutes
            } = await getBody();


            if (!username) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Username necessário."
                    },
                    400
                );

            }


            const minutes =
                Number(durationMinutes);


            const safeMinutes =
                Number.isFinite(minutes) &&
                minutes > 0
                    ? minutes
                    : 60;


            const expiresAt =
                now +
                safeMinutes *
                60 *
                1000;


            const res =
                await supabase(
                    "temp_admins",
                    {
                        method: "POST",

                        headers: {
                            "Prefer":
                                "resolution=merge-duplicates"
                        },

                        body:
                            JSON.stringify({

                                username:
                                    username.trim(),

                                expires_at:
                                    expiresAt

                            })
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Não foi possível adicionar o Temp Admin."
                    },
                    500
                );

            }


            return jsonResponse({

                success: true,

                username:
                    username.trim(),

                expiresAt,

                minutes:
                    safeMinutes

            });

        }


        // =====================================================
        // TEMP ADMIN - EDIT EXPIRATION
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/temp-admins/edit-expire"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                username,
                expiresAt,
                addMinutes
            } = await getBody();


            if (!username) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Username necessário."
                    },
                    400
                );

            }


            let newExpiresAt;


            // -----------------------------------------------
            // EXPIRAÇÃO ABSOLUTA
            // -----------------------------------------------

            if (
                expiresAt !== undefined &&
                expiresAt !== null
            ) {

                const value =
                    Number(expiresAt);


                if (
                    !Number.isFinite(value) ||
                    value <= 0
                ) {

                    return jsonResponse(
                        {
                            success: false,
                            message:
                                "expiresAt inválido."
                        },
                        400
                    );

                }


                newExpiresAt =
                    value;

            }


            // -----------------------------------------------
            // ADICIONAR TEMPO À EXPIRAÇÃO ATUAL
            // -----------------------------------------------

            else if (
                addMinutes !== undefined &&
                addMinutes !== null
            ) {

                const minutes =
                    Number(addMinutes);


                if (
                    !Number.isFinite(minutes) ||
                    minutes <= 0
                ) {

                    return jsonResponse(
                        {
                            success: false,
                            message:
                                "addMinutes inválido."
                        },
                        400
                    );

                }


                const existingRes =
                    await supabase(
                        `temp_admins?username=eq.${encodeURIComponent(username.trim())}&select=expires_at`
                    );


                const existing =
                    await existingRes.json();


                if (
                    !Array.isArray(existing) ||
                    existing.length === 0
                ) {

                    return jsonResponse(
                        {
                            success: false,
                            message:
                                "Temp Admin não encontrado."
                        },
                        404
                    );

                }


                const currentExpiration =
                    Number(
                        existing[0].expires_at
                    );


                /*
                 * Se já expirou, começa a partir
                 * do momento atual.
                 */

                const base =
                    currentExpiration > now
                        ? currentExpiration
                        : now;


                newExpiresAt =
                    base +
                    minutes *
                    60 *
                    1000;

            }


            else {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Forneça expiresAt ou addMinutes."
                    },
                    400
                );

            }


            const res =
                await supabase(
                    `temp_admins?username=eq.${encodeURIComponent(username.trim())}`,
                    {
                        method: "PATCH",

                        body:
                            JSON.stringify({
                                expires_at:
                                    newExpiresAt
                            })
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Erro ao atualizar expiração."
                    },
                    500
                );

            }


            return jsonResponse({

                success: true,

                username:
                    username.trim(),

                expiresAt:
                    newExpiresAt

            });

        }


        // =====================================================
        // TEMP ADMIN - REMOVE
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/temp-admins/remove"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                username
            } = await getBody();


            if (!username) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Username necessário."
                    },
                    400
                );

            }


            await supabase(
                `temp_admins?username=eq.${encodeURIComponent(username.trim())}`,
                {
                    method: "DELETE"
                }
            );


            return jsonResponse({

                success: true,

                message:
                    `Temp Admin ${username} removido.`

            });

        }


        // =====================================================
        // ADMINS PERMANENTES - LIST
        // =====================================================

        if (
            method === "GET" &&
            url.pathname ===
                "/api/manox/admins"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const res =
                await supabase(
                    "permanent_admins?select=*&order=added_at.desc"
                );


            const admins =
                await res.json();


            return jsonResponse({

                success: true,

                admins:
                    Array.isArray(admins)
                        ? admins
                        : []

            });

        }


        // =====================================================
        // ADMIN PERMANENTE - ADD
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/admins/add"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                username
            } = await getBody();


            if (!username) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Username necessário."
                    },
                    400
                );

            }


            const res =
                await supabase(
                    "permanent_admins",
                    {
                        method: "POST",

                        headers: {
                            "Prefer":
                                "resolution=merge-duplicates"
                        },

                        body:
                            JSON.stringify({

                                username:
                                    username.trim(),

                                added_at:
                                    now

                            })
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Erro ao adicionar Admin."
                    },
                    500
                );

            }


            return jsonResponse({

                success: true,

                username:
                    username.trim()

            });

        }


        // =====================================================
        // ADMIN PERMANENTE - REMOVE
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/admins/remove"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                username
            } = await getBody();


            if (!username) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Username necessário."
                    },
                    400
                );

            }


            await supabase(
                `permanent_admins?username=eq.${encodeURIComponent(username.trim())}`,
                {
                    method: "DELETE"
                }
            );


            return jsonResponse({

                success: true,

                message:
                    `Admin ${username} removido.`

            });

        }


        // =====================================================
        // OWNERS - LIST
        // =====================================================

        if (
            method === "GET" &&
            url.pathname ===
                "/api/manox/owners"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const res =
                await supabase(
                    "owners?select=*&order=added_at.desc"
                );


            const owners =
                await res.json();


            return jsonResponse({

                success: true,

                owners:
                    Array.isArray(owners)
                        ? owners
                        : []

            });

        }


        // =====================================================
        // OWNER - ADD
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/owners/add"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                username
            } = await getBody();


            if (!username) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Username necessário."
                    },
                    400
                );

            }


            const res =
                await supabase(
                    "owners",
                    {
                        method: "POST",

                        headers: {
                            "Prefer":
                                "resolution=merge-duplicates"
                        },

                        body:
                            JSON.stringify({

                                username:
                                    username.trim(),

                                added_at:
                                    now

                            })
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Erro ao adicionar Owner."
                    },
                    500
                );

            }


            return jsonResponse({

                success: true,

                username:
                    username.trim()

            });

        }


        // =====================================================
        // OWNER - REMOVE
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/owners/remove"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                username
            } = await getBody();


            if (!username) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Username necessário."
                    },
                    400
                );

            }


            await supabase(
                `owners?username=eq.${encodeURIComponent(username.trim())}`,
                {
                    method: "DELETE"
                }
            );


            return jsonResponse({

                success: true,

                message:
                    `Owner ${username} removido.`

            });

        }


        // =====================================================
        // SYSTEM MESSAGE
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/system-message"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                message
            } = await getBody();


            if (!message) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Mensagem necessária."
                    },
                    400
                );

            }


            const sysMsg = {

                id:
                    `system-${now}`,

                message:
                    message
                        .trim()
                        .slice(0, 250),

                created_at:
                    now

            };


            const res =
                await supabase(
                    "system_messages",
                    {
                        method: "POST",

                        body:
                            JSON.stringify(
                                sysMsg
                            )
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Erro ao salvar mensagem."
                    },
                    500
                );

            }


            return jsonResponse({

                success: true,

                message:
                    sysMsg

            });

        }


        // =====================================================
        // SYSTEM MESSAGES - LIST
        // =====================================================

        if (
            method === "GET" &&
            url.pathname ===
                "/api/manox/system-messages"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const res =
                await supabase(
                    "system_messages?select=*&order=created_at.desc&limit=50"
                );


            const messages =
                await res.json();


            return jsonResponse({

                success: true,

                messages:
                    Array.isArray(messages)
                        ? messages.reverse()
                        : []

            });

        }


        // =====================================================
        // CLEAR GLOBAL CHAT
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/chat/clear"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const res =
                await supabase(
                    "global_messages?id=neq.0",
                    {
                        method: "DELETE"
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Erro ao limpar chat."
                    },
                    500
                );

            }


            return jsonResponse({

                success: true,

                message:
                    "Chat global limpo."

            });

        }


        // =====================================================
        // CLEAR SERVER CHAT
        // =====================================================

        if (
            method === "POST" &&
            url.pathname ===
                "/api/manox/server-chat/clear"
        ) {

            const auth =
                requireAdmin();

            if (auth)
                return auth;


            const {
                serverId
            } = await getBody();


            if (!serverId) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "serverId necessário."
                    },
                    400
                );

            }


            const res =
                await supabase(
                    `server_messages?server_id=eq.${encodeURIComponent(serverId.trim())}`,
                    {
                        method: "DELETE"
                    }
                );


            if (!res.ok) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Erro ao limpar chat do servidor."
                    },
                    500
                );

            }


            return jsonResponse({

                success: true,

                message:
                    "Chat do servidor limpo."

            });

        }


        // =====================================================
        // 404
        // =====================================================

        return jsonResponse(
            {
                success: false,
                message:
                    "Rota não encontrada."
            },
            404
        );

    }
};
