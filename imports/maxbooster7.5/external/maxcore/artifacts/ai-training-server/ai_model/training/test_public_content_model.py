import io
import unittest
import numpy as np
import torch
from ai_model.gpu.candidate_training import array
from ai_model.model.candidate_model import CandidateModel, PublicContentTransformer

class PublicContentModelTests(unittest.TestCase):
    def test_manual_gradients(self):
        torch.set_num_threads(1)
        model = PublicContentTransformer(seed=73, context=128, width=128, layers=2, heads=4, expansion=2)
        ids = np.array([[257,65,66,67],[257,68,69,70]])
        targets = np.array([[65,66,67,258],[68,69,70,258]])
        w = {n:p.detach().clone().requires_grad_() for n,p in model.named_parameters()}
        x = w['embedding.weight'][torch.from_numpy(ids)] + w['position.weight'][torch.arange(4)]
        for i in range(2):
            p = f'blocks.{i}.'
            n = torch.nn.functional.layer_norm(x,(128,),w[p+'norm1.gamma'],w[p+'norm1.beta'])
            q,k,v = [part.reshape(2,4,4,32).transpose(1,2) for part in (n@w[p+'attention.qkv_proj.weight']).chunk(3,-1)]
            scores = (q@k.transpose(-1,-2))/np.sqrt(32)
            scores = scores.masked_fill(torch.ones(4,4,dtype=torch.bool).triu(1),float('-inf'))
            att = (scores.softmax(-1)@v).transpose(1,2).reshape(2,4,128)
            x = x + att@w[p+'attention.out_proj.weight']
            n = torch.nn.functional.layer_norm(x,(128,),w[p+'norm2.gamma'],w[p+'norm2.beta'])
            x = x + torch.tanh(n@w[p+'hidden.weight'])@w[p+'contract.weight']
        logits = x@w['output.weight']
        loss = torch.nn.functional.cross_entropy(logits.reshape(-1,259),torch.from_numpy(targets.reshape(-1)))
        loss.backward()
        weights = {n:array(p).copy() for n,p in model.named_parameters()}
        actual,tape = model.backend.dispatch('transformer_forward',weights,ids,model.model_config)
        np.testing.assert_allclose(actual,array(logits),atol=1e-4,rtol=1e-4)
        _,gradient = model.backend.dispatch('cross_entropy',actual.reshape(-1,259),targets.reshape(-1))
        grads = model.backend.dispatch('transformer_backward',weights,tape,gradient.reshape(actual.shape))
        for name in weights:
            np.testing.assert_allclose(grads[name],array(w[name].grad),atol=1e-4,rtol=2e-3,err_msg=name)
        state = {}
        model.backend.manual_train_step(model,ids,targets,.0001,optimizer_state=state)
        self.assertEqual(state['step'],1)
        self.assertEqual(set(state['m']),set(weights))

    def test_causality_checkpoint_sampling(self):
        model = PublicContentTransformer(seed=11,context=128,width=128,layers=2,heads=8)
        ids = torch.tensor([[257,65,66,67]])
        before = array(model.sequence_logits(ids))
        ids[0,-1] = 99
        np.testing.assert_array_equal(before[:,:-1],array(model.sequence_logits(ids))[:,:-1])
        saved = io.BytesIO()
        torch.save({'architecture':model.architecture,'smoke_only':True,'context_tokens':model.context,'model_config':model.model_config,'state_dict':model.state_dict()},saved)
        saved.seek(0)
        restored = CandidateModel.load_candidate(saved)
        kwargs = dict(max_new_tokens=8,temperature=.8,top_k=32,seed=3,min_length=8)
        self.assertEqual(model.generate('prompt',**kwargs),restored.generate('prompt',**kwargs))
        self.assertEqual(len(model.generate('prompt',**kwargs)['token_ids']),8)
        with self.assertRaises(ValueError): model.generate('a'*125,**kwargs)

    def test_bounds(self):
        for kwargs in ({'width':127},{'heads':7},{'layers':0},{'width':1024,'layers':16,'context':4096}):
            with self.assertRaises(ValueError): PublicContentTransformer(**kwargs)

    def test_adamw_matches_reference_and_resumes(self):
        model = PublicContentTransformer(width=128,layers=1,context=128)
        reference = torch.nn.Parameter(torch.tensor([1.,-2.,3.]))
        optimizer = torch.optim.AdamW([reference],lr=.001,weight_decay=.01)
        state = {}
        weight = np.array([1.,-2.,3.],dtype=np.float32)
        for _ in range(3):
            gradient = np.array([4.,-2.,1.],dtype=np.float32)
            reference.grad = torch.from_numpy(gradient.copy())
            torch.nn.utils.clip_grad_norm_([reference],1.,error_if_nonfinite=True)
            optimizer.step()
            updates,state = model.backend.dispatch('adamw',{'a':weight},{'a':gradient},state,.001,1.,.01)
            weight = updates['a']
            np.testing.assert_allclose(weight,array(reference),atol=1e-6,rtol=1e-6)
            saved = io.BytesIO()
            torch.save(state,saved)
            saved.seek(0)
            state = torch.load(saved,weights_only=True)
        self.assertEqual(state['step'],3)
        before = weight.copy()
        with self.assertRaises(ValueError):
            model.backend.dispatch('adamw',{'a':weight},{'a':np.array([np.nan,0,0])},state,.001,1.,.01)
        np.testing.assert_array_equal(weight,before)
        self.assertEqual(state['step'],3)
