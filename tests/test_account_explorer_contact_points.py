import unittest

from app.account_explorer import ExplorerConfig, _aggregate_contact_points


class ContactPointAggregationTests(unittest.TestCase):
    def test_aggregate_contact_points_collects_sources(self) -> None:
        records = [
            {"Id": "cpp1", "Contact__c": "0031", "ParentId": "0Ii1"},
            {"Id": "cpp2", "ParentId": "0Ii1"},
            {"Id": "cpp3", "Contact__c": "0031"},
        ]

        mapping = _aggregate_contact_points(
            records,
            contact_field="Contact__c",
            individual_field="ParentId",
        )

        self.assertIn("0031", mapping["contact"])
        self.assertEqual(
            {record["Id"] for record in mapping["contact"]["0031"]},
            {"cpp1", "cpp3"},
        )
        self.assertIn("0Ii1", mapping["individual"])
        self.assertEqual(
            {record["Id"] for record in mapping["individual"]["0Ii1"]},
            {"cpp1", "cpp2"},
        )
        self.assertEqual(
            records[0]["_link_sources"],
            [
                {"type": "contact", "field": "Contact__c"},
                {"type": "individual", "field": "ParentId"},
            ],
        )
        self.assertEqual(
            records[1]["_link_sources"],
            [{"type": "individual", "field": "ParentId"}],
        )
        self.assertEqual(
            records[2]["_link_sources"],
            [{"type": "contact", "field": "Contact__c"}],
        )

    def test_aggregate_contact_points_handles_disabled_modes(self) -> None:
        records = [{"Id": "cpp1", "ParentId": "0Ii1"}]

        mapping = _aggregate_contact_points(
            records,
            contact_field=None,
            individual_field="ParentId",
        )

        self.assertEqual(mapping["contact"], {})
        self.assertIn("0Ii1", mapping["individual"])
        self.assertEqual(
            records[0]["_link_sources"],
            [{"type": "individual", "field": "ParentId"}],
        )


class ExplorerConfigContactPointTests(unittest.TestCase):
    def test_contact_point_modes_default_to_all(self) -> None:
        config = ExplorerConfig()

        self.assertEqual(
            config.get_contact_point_modes("ContactPointPhone"),
            {"contact", "individual"},
        )
        self.assertEqual(
            config.get_contact_point_modes("ContactPointEmail"),
            {"contact", "individual"},
        )

        payload = config.to_dict()
        self.assertEqual(
            payload["contactPointLinks"]["ContactPointPhone"],
            ["contact", "individual"],
        )
        self.assertEqual(
            payload["contactPointLinks"]["ContactPointEmail"],
            ["contact", "individual"],
        )

    def test_contact_point_modes_respect_configuration(self) -> None:
        config = ExplorerConfig(contact_point_links={"ContactPointPhone": ["contact"]})

        self.assertEqual(
            config.get_contact_point_modes("ContactPointPhone"),
            {"contact"},
        )
        self.assertEqual(
            config.get_contact_point_modes("ContactPointEmail"),
            {"contact", "individual"},
        )

        payload = config.to_dict()
        self.assertEqual(payload["contactPointLinks"]["ContactPointPhone"], ["contact"])
        self.assertEqual(
            payload["contactPointLinks"]["ContactPointEmail"],
            ["contact", "individual"],
        )


if __name__ == "__main__":
    unittest.main()
