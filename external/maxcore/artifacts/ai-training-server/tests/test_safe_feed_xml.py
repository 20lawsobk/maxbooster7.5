import unittest
from ai_model.safe_feed_xml import parse_feed_xml


class SafeFeedXMLTests(unittest.TestCase):
    def test_rss_and_atom(self):
        self.assertEqual(parse_feed_xml("<rss><item><title>Music &amp; news</title></item></rss>")
                         .findtext(".//title"), "Music & news")
        self.assertEqual(parse_feed_xml('<feed xmlns="http://www.w3.org/2005/Atom"/>').tag,
                         "{http://www.w3.org/2005/Atom}feed")

    def test_rejects_dtd_entities_and_encoded_variants(self):
        for text in [
            '<!DOCTYPE rss SYSTEM "file:///etc/passwd"><rss/>',
            '<!DOCTYPE rss [<!ENTITY x "expanded">]><rss>&x;</rss>',
        ]:
            for payload in [text, text.encode("utf-16"), text.encode("utf-8")]:
                with self.assertRaises(ValueError):
                    parse_feed_xml(payload)

    def test_bounded_structure_and_bytes(self):
        for payload in ["<r>" * 129 + "</r>" * 129, "<r>" + "<x/>" * 10000 + "</r>", b" " * (2*1024*1024+1)]:
            with self.assertRaises(ValueError):
                parse_feed_xml(payload)


if __name__ == "__main__":
    unittest.main()