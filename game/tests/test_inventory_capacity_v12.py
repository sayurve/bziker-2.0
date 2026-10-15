import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from game import GameService,GameError
from world import WorldService
from economy import EconomyService,ITEMS,change_inventory,inventory_quantity,BAG_CAPACITY


class InventoryCapacityTests(unittest.TestCase):
    def test_ten_stacks_allow_more_of_an_owned_item_and_reject_an_eleventh_type_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=GameService(Path(tmp)/'bag.db');world=WorldService(game);economy=EconomyService(game,world)
            uid=game.create_account();game.profile(uid,{'name':'Ячейки'})
            extras={f'test-{i}':{'id':f'test-{i}','name':str(i),'kind':'tool'} for i in range(11)}
            with patch.dict(ITEMS,extras):
                with game.transaction() as db:
                    for i in range(10):change_inventory(db,uid,f'test-{i}',1)
                    change_inventory(db,uid,'test-0',12)
                self.assertEqual(economy.snapshot(uid)['inventory_used'],BAG_CAPACITY)
                with self.assertRaises(GameError) as caught:
                    with game.transaction() as db:change_inventory(db,uid,'test-10',1)
                self.assertEqual(caught.exception.code,'inventory_full')
                with game.transaction() as db:
                    self.assertEqual(inventory_quantity(db,uid,'test-10'),0)
                    self.assertEqual(inventory_quantity(db,uid,'test-0'),13)
                    change_inventory(db,uid,'test-1',-1);change_inventory(db,uid,'test-10',1)
                self.assertEqual(economy.snapshot(uid)['inventory_used'],10)

    def test_wardrobe_and_base_furniture_do_not_consume_bag_slots(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=GameService(Path(tmp)/'catalog.db');world=WorldService(game);economy=EconomyService(game,world)
            uid=game.create_account();game.profile(uid,{'name':'Каталоги'})
            with game.transaction() as db:
                change_inventory(db,uid,'outfit-1',1);change_inventory(db,uid,'furniture-sofa',1);change_inventory(db,uid,'snack',5)
            snap=economy.snapshot(uid);self.assertEqual(snap['inventory_used'],1);self.assertEqual(snap['inventory_capacity'],10)
            self.assertIn(1,snap['unlocked_outfits'])


if __name__=='__main__':unittest.main()
