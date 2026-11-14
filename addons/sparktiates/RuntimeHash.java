import java.security.MessageDigest;

/** Test déterministe Java 11+ : SHA-256 des octets UTF-8 reçus sur stdin. */
class RuntimeHash {
    public static void main(String[] args) throws Exception {
        byte[] data = System.in.readAllBytes();
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(data);
        StringBuilder hex = new StringBuilder(64);
        for (byte b : hash) hex.append(String.format("%02x", b & 0xff));
        System.out.println(hex);
    }
}
