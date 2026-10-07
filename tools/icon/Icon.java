import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

public class Icon {
    public static void main(String[] args) throws Exception {
        String out = args[0];
        int[] sizes = {512, 192, 180};
        String[] names = {"icon-512.png", "icon-192.png", "apple-touch-icon.png"};
        for (int k = 0; k < sizes.length; k++) {
            int S = sizes[k];
            double u = S / 512.0;
            BufferedImage img = new BufferedImage(S, S, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = img.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);

            // 시험지 바탕
            g.setColor(new Color(0x1f, 0x4e, 0x8c));
            g.fillRect(0, 0, S, S);

            // 글자: 실기
            Font f = new Font("Malgun Gothic", Font.BOLD, (int) Math.round(138 * u));
            g.setFont(f);
            FontMetrics fm = g.getFontMetrics();
            String t = "실기";
            int tw = fm.stringWidth(t);
            int tx = (S - tw) / 2;
            int ty = (int) Math.round(S / 2.0 + (fm.getAscent() - fm.getDescent()) / 2.0);
            g.setColor(new Color(0xf8, 0xf8, 0xf5));
            g.drawString(t, tx, ty);

            // 빨간 펜 채점 동그라미 (살짝 기울어진 타원, 끝이 겹치게)
            g.setColor(new Color(0xe0, 0x4a, 0x3f));
            g.setStroke(new BasicStroke((float) (20 * u), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            AffineTransform old = g.getTransform();
            g.rotate(Math.toRadians(-12), S / 2.0, S / 2.0);
            double w = 360 * u, h = 280 * u;
            Arc2D arc = new Arc2D.Double(S / 2.0 - w / 2, S / 2.0 - h / 2 + 4 * u, w, h, 112, 335, Arc2D.OPEN);
            g.draw(arc);
            g.setTransform(old);
            g.dispose();
            ImageIO.write(img, "png", new File(out, names[k]));
        }
        System.out.println("ok");
    }
}
