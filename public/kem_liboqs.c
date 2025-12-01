// kem_liboqs.c
#include <oqs/oqs.h>
#include <stdint.h>

static OQS_KEM *kem = NULL;

int kem_init()
{
    if (kem)
    {
        OQS_KEM_free(kem);
        kem = NULL;
    }
    kem = OQS_KEM_new("ML-KEM-768");
    return kem ? 0 : 1;
}

int kem_pk_len() { return kem ? (int)kem->length_public_key : -1; }
int kem_sk_len() { return kem ? (int)kem->length_secret_key : -1; }
int kem_ct_len() { return kem ? (int)kem->length_ciphertext : -1; }
int kem_ss_len() { return kem ? (int)kem->length_shared_secret : -1; }

int kem_keypair(uint8_t *pk_out, uint8_t *sk_out)
{
    if (!kem)
        return 1;
    return OQS_KEM_keypair(kem, pk_out, sk_out);
}

int kem_encaps(const uint8_t *pk, uint8_t *ct_out, uint8_t *ss_out)
{
    if (!kem)
        return 1;
    return OQS_KEM_encaps(kem, ct_out, ss_out, pk);
}

int kem_decaps(const uint8_t *ct, const uint8_t *sk, uint8_t *ss_out)
{
    if (!kem)
        return 1;
    return OQS_KEM_decaps(kem, ss_out, ct, sk);
}

void kem_free()
{
    if (kem)
    {
        OQS_KEM_free(kem);
        kem = NULL;
    }
}
